import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.8';
import type { Database, NotificationDelivery } from '../../../src/types/database.ts';

import {
  computeRruleUntil,
  expandEventWithExceptions,
  type EventException,
  type Occurrence,
} from '../../../src/lib/recurrence.ts';
import { fromWallClock } from '../../../src/lib/timezone.ts';
import {
  buildPushMessage,
  chunks,
  expoErrorCode,
  retryDelaySeconds,
  type ExpoPushMessage,
  type OutboxJob,
} from '../_shared/push.ts';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

type AdminClient = SupabaseClient<Database>;
type Delivery = {
  outbox_id: number;
  expo_token: string;
  status: 'PENDING' | 'SENDING' | 'TICKETED' | 'DELIVERED' | 'FAILED';
  attempts: number;
  ticket_id: string | null;
  ticketed_at: string | null;
};
type ReminderCandidate = {
  reminder_id: string;
  user_id: string;
  minutes_before: number;
  calendar_name: string;
  event: {
    id: string;
    calendar_id: string;
    title: string;
    description: string | null;
    location: string | null;
    is_all_day: boolean;
    start_at: string | null;
    end_at: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string;
    rrule: string | null;
  };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function secretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const raw = requiredEnv('SUPABASE_SECRET_KEYS');
  const keys = JSON.parse(raw) as Record<string, string>;
  if (!keys.default) throw new Error('SUPABASE_SECRET_KEYS.default is not configured');
  return keys.default;
}

function expoHeaders() {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  return {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function disableToken(admin: AdminClient, userId: string, expoToken: string) {
  await checked(admin
    .from('device_tokens')
    .update({ disabled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('expo_token', expoToken));
}

async function checked<T>(operation: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await operation;
  if (error) throw error;
  return data;
}

type CleanupJob = { id: number; bucket_id: string; storage_path: string; attempts: number };

export async function cleanStorage(admin: AdminClient) {
  const jobs = (await checked(admin.rpc('claim_storage_cleanup', { p_limit: 100 })) ?? []) as CleanupJob[];
  let removed = 0;
  let retrying = 0;
  for (const job of jobs) {
    const { error } = await admin.storage.from(job.bucket_id).remove([job.storage_path]);
    if (error) {
      await checked(admin.from('storage_cleanup_jobs').update({
        status: 'PENDING', claimed_at: null,
        next_attempt_at: new Date(Date.now() + Math.min(3600, retryDelaySeconds(job.attempts)) * 1000).toISOString(),
        last_error: error.message,
      }).eq('id', job.id));
      retrying++;
    } else {
      await checked(admin.from('storage_cleanup_jobs').update({
        status: 'DONE', claimed_at: null, completed_at: new Date().toISOString(), last_error: null,
      }).eq('id', job.id));
      removed++;
    }
  }
  return { claimed: jobs.length, removed, retrying };
}

async function repairRecurrenceBounds(admin: AdminClient) {
  const rows = await checked(admin.from('events')
    .select('id,is_all_day,start_at,end_at,start_date,end_date,timezone,rrule,updated_at')
    .is('rrule_until', null).not('rrule', 'is', null)
    .or('rrule.ilike.%COUNT=%,rrule.ilike.%UNTIL=%').order('id').limit(100));
  let repaired = 0;
  for (const row of rows ?? []) {
    // Oversized/unsupported finite rules remain conservatively unbounded. The
    // infinity sentinel also prevents one such rule starving the repair batch.
    const rruleUntil = computeRruleUntil(row) ?? 'infinity';
    const changed = await checked(admin.from('events').update({ rrule_until: rruleUntil })
      .eq('id', row.id).eq('updated_at', row.updated_at).is('rrule_until', null).select('id'));
    repaired += changed?.length ?? 0;
  }
  return repaired;
}

function occurrenceStart(occurrence: Occurrence) {
  if (!occurrence.is_all_day) return new Date(occurrence.start_at!);

  const [year, month, day] = occurrence.start_date!.split('-').map(Number);
  return fromWallClock(
    { year, month, day, hour: 0, minute: 0 },
    occurrence.timezone || 'Asia/Seoul',
  );
}

async function scanReminders(admin: AdminClient) {
  // 1분 스케줄이 잠깐 밀려도 놓치지 않도록 뒤 90초, 앞 30초를 함께 본다.
  const triggerFrom = new Date(Date.now() - 90_000);
  const triggerTo = new Date(Date.now() + 30_000);
  const candidates: ReminderCandidate[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = (await checked(admin.rpc('reminder_scan_candidates', {
      p_from: triggerFrom.toISOString(), p_to: triggerTo.toISOString(),
    }).range(offset, offset + 499)) ?? []) as ReminderCandidate[];
    candidates.push(...page);
    if (page.length < 500) break;
  }
  if (!candidates.length) return { candidates: 0, queued: 0 };

  const eventIds = [...new Set(candidates.map((candidate) => candidate.event.id))];
  const exceptions: EventException[] = [];
  for (const ids of chunks(eventIds, 100)) {
    for (let offset = 0; ; offset += 500) {
      const page = (await checked(admin.from('event_exceptions')
        .select('event_id,original_start,type,title,description,location,is_all_day,start_at,end_at,start_date,end_date')
        .in('event_id', ids).order('event_id').order('original_start').range(offset, offset + 499)) ?? []) as EventException[];
      exceptions.push(...page);
      if (page.length < 500) break;
    }
  }

  const rows = [];
  for (const candidate of candidates) {
    const occurrenceFrom = new Date(
      triggerFrom.getTime() + candidate.minutes_before * 60_000,
    );
    const occurrenceTo = new Date(
      triggerTo.getTime() + candidate.minutes_before * 60_000,
    );
    const eventExceptions = exceptions.filter(
      (exception) => exception.event_id === candidate.event.id,
    );
    const occurrences = expandEventWithExceptions(candidate.event, occurrenceFrom, occurrenceTo, eventExceptions, candidate.event.timezone);

    for (const occurrence of occurrences) {
      const startsAt = occurrenceStart(occurrence);
      const triggerAt = startsAt.getTime() - candidate.minutes_before * 60_000;
      if (triggerAt < triggerFrom.getTime() || triggerAt >= triggerTo.getTime()) continue;

      rows.push({
        user_id: candidate.user_id,
        type: 'REMINDER',
        dedup_key: [
          'REMINDER',
          candidate.event.id,
          occurrence.originalStart,
          candidate.user_id,
          candidate.minutes_before,
        ].join(':'),
        payload: {
          event_id: candidate.event.id,
          calendar_id: candidate.event.calendar_id,
          calendar_name: candidate.calendar_name,
          title: (occurrence as Occurrence & { title: string }).title,
          is_all_day: occurrence.is_all_day,
          start_at: occurrence.start_at,
          start_date: occurrence.start_date,
          timezone: occurrence.timezone,
          original_start: occurrence.originalStart,
          minutes_before: candidate.minutes_before,
        },
      });
    }
  }

  if (!rows.length) return { candidates: candidates.length, queued: 0 };

  const { error: insertError } = await admin.from('notification_outbox').upsert(rows, {
    onConflict: 'dedup_key',
    ignoreDuplicates: true,
  });
  if (insertError) throw insertError;

  return { candidates: candidates.length, queued: rows.length };
}

export async function checkReceipts(admin: AdminClient) {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('outbox_id,expo_token,status,attempts,ticket_id,ticketed_at')
    .eq('status', 'TICKETED')
    .not('ticket_id', 'is', null)
    .lte('ticketed_at', cutoff)
    .order('ticketed_at')
    .limit(1000);

  if (error) throw error;
  const deliveries = (data ?? []) as Delivery[];
  if (!deliveries.length) return { checked: 0, delivered: 0, failed: 0 };

  const outboxIds = [...new Set(deliveries.map((delivery) => delivery.outbox_id))];
  const { data: owners, error: ownersError } = await admin
    .from('notification_outbox')
    .select('id,user_id')
    .in('id', outboxIds);
  if (ownersError) throw ownersError;
  const userByOutbox = new Map((owners ?? []).map((row) => [row.id as number, row.user_id as string]));

  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({ ids: deliveries.map((delivery) => delivery.ticket_id) }),
  });
  if (!response.ok) throw new Error(`Expo receipt HTTP ${response.status}: ${await response.text()}`);

  const result = (await response.json()) as {
    data?: Record<
      string,
      { status: 'ok' | 'error'; message?: string; details?: { error?: string } }
    >;
  };

  let delivered = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const delivery of deliveries) {
    const receipt = delivery.ticket_id ? result.data?.[delivery.ticket_id] : undefined;

    if (!receipt) {
      const expired =
        delivery.ticketed_at &&
        Date.now() - new Date(delivery.ticketed_at).getTime() >= RECEIPT_EXPIRY_MS;
      if (!expired) continue;

      await checked(admin
        .from('notification_deliveries')
        .update({
          status: 'FAILED',
          last_error: 'Expo receipt was unavailable for 24 hours',
          receipt_checked_at: now,
        })
        .eq('outbox_id', delivery.outbox_id)
        .eq('expo_token', delivery.expo_token));
      failed++;
      continue;
    }

    if (receipt.status === 'ok') {
      await checked(admin
        .from('notification_deliveries')
        .update({ status: 'DELIVERED', last_error: null, receipt_checked_at: now })
        .eq('outbox_id', delivery.outbox_id)
        .eq('expo_token', delivery.expo_token));
      delivered++;
      continue;
    }

    const code = expoErrorCode(receipt);
    await checked(admin
      .from('notification_deliveries')
      .update({
        status: 'FAILED',
        last_error: `${code ?? 'ExpoReceiptError'}: ${receipt.message ?? 'unknown error'}`,
        receipt_checked_at: now,
      })
      .eq('outbox_id', delivery.outbox_id)
      .eq('expo_token', delivery.expo_token));

    if (code === 'DeviceNotRegistered') {
      const userId = userByOutbox.get(delivery.outbox_id);
      if (userId) await disableToken(admin, userId, delivery.expo_token);
    }
    failed++;
  }

  return { checked: deliveries.length, delivered, failed };
}

export async function sendBatch(
  admin: AdminClient,
  jobsById: Map<number, OutboxJob>,
  deliveries: Delivery[],
) {
  const ready: Delivery[] = [];
  try {
    for (const delivery of deliveries) {
      const job = jobsById.get(delivery.outbox_id);
      if (!job) throw new Error(`Outbox ${delivery.outbox_id} was not claimed`);
      if (job.type === 'REMINDER' && !(await isCurrentReminder(admin, job))) {
        await checked(admin.from('notification_deliveries').update({
          status: 'FAILED', last_error: 'Reminder occurrence was cancelled or rescheduled',
        }).eq('outbox_id', delivery.outbox_id).eq('expo_token', delivery.expo_token).eq('status', 'PENDING'));
        continue;
      }
      const valid = await checked(admin.rpc('begin_notification_delivery', {
        p_outbox_id: delivery.outbox_id, p_expo_token: delivery.expo_token,
      }));
      if (valid) ready.push(delivery);
    }
  } catch (error) {
    // No request has left this process: these preflight markers are safe to retry.
    for (const delivery of ready) await checked(admin.from('notification_deliveries')
      .update({ status: 'PENDING', sending_at: null, last_error: 'Send preparation failed' })
      .eq('outbox_id', delivery.outbox_id).eq('expo_token', delivery.expo_token).eq('status', 'SENDING'));
    throw error;
  }
  if (!ready.length) return 0;
  const messages = ready.map((delivery) => {
    const job = jobsById.get(delivery.outbox_id);
    if (!job) throw new Error(`Outbox ${delivery.outbox_id} was not claimed`);
    return buildPushMessage(job, delivery.expo_token);
  });

  const response = await fetch(EXPO_SEND_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify(messages satisfies ExpoPushMessage[]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    for (const delivery of ready) await checked(admin.from('notification_deliveries')
      .update({
        status: retryable && delivery.attempts + 1 < 3 ? 'PENDING' : 'FAILED',
        sending_at: null, last_error: `Expo push HTTP ${response.status}`,
      }).eq('outbox_id', delivery.outbox_id).eq('expo_token', delivery.expo_token).eq('status', 'SENDING'));
    return 0;
  }

  const result = (await response.json()) as {
    data?: Array<{
      status: 'ok' | 'error';
      id?: string;
      message?: string;
      details?: { error?: string };
    }>;
  };
  if (!Array.isArray(result.data) || result.data.length !== ready.length) {
    throw new Error('Expo push response length did not match the request');
  }

  const now = new Date().toISOString();

  const persistenceErrors: unknown[] = [];
  let accepted = 0;
  for (let index = 0; index < ready.length; index++) {
    const delivery = ready[index];
    const ticket = result.data[index];
    const attempts = delivery.attempts + 1;

    const code = expoErrorCode(ticket);
    const ticketed = ticket.status === 'ok' && Boolean(ticket.id);
    const retryable = code === 'MessageRateExceeded' || code === 'InternalServerError';
    const patch: Partial<NotificationDelivery> = ticketed ? {
      status: 'TICKETED', attempts, ticket_id: ticket.id, ticketed_at: now, last_error: null,
    } : {
      status: retryable && attempts < 3 ? 'PENDING' : 'FAILED', attempts, sending_at: null,
      last_error: `${code ?? 'ExpoTicketError'}: ${ticket.message ?? 'unknown error'}`,
    };
    // Retry recording the SAME known ticket, never resend its push request. A
    // permanent DB failure leaves SENDING so recovery reports an uncertain send.
    let saved = false;
    let saveError: unknown;
    for (let retry = 0; retry < 3 && !saved; retry++) {
      try {
        await checked(admin.from('notification_deliveries').update(patch)
          .eq('outbox_id', delivery.outbox_id).eq('expo_token', delivery.expo_token));
        saved = true;
      } catch (error) { saveError = error; }
    }
    if (!saved) { persistenceErrors.push(saveError); continue; }
    if (ticketed) accepted++;
    try {
      if (code === 'DeviceNotRegistered') {
        const userId = jobsById.get(delivery.outbox_id)?.user_id;
        if (userId) await disableToken(admin, userId, delivery.expo_token);
      }
    } catch (error) {
      persistenceErrors.push(error);
    }
  }
  if (persistenceErrors.length) throw new AggregateError(persistenceErrors, 'Expo result persistence failed');
  return accepted;
}

export async function isCurrentReminder(admin: AdminClient, job: OutboxJob) {
  const eventId = job.payload.event_id;
  const originalStart = job.payload.original_start;
  if (typeof eventId !== 'string' || typeof originalStart !== 'string') return false;
  const event = await checked(admin.from('events')
    .select('id,calendar_id,title,description,location,is_all_day,start_at,end_at,start_date,end_date,timezone,rrule')
    .eq('id', eventId).is('deleted_at', null).maybeSingle());
  if (!event) return false;
  const exceptions = await checked(admin.from('event_exceptions')
    .select('event_id,original_start,type,title,description,location,is_all_day,start_at,end_at,start_date,end_date')
    .eq('event_id', eventId).eq('original_start', originalStart));
  const startAt = job.payload.start_at;
  const startDate = job.payload.start_date;
  const zone = typeof job.payload.timezone === 'string' ? job.payload.timezone : event.timezone;
  let expectedStart: Date;
  if (job.payload.is_all_day === true && typeof startDate === 'string') {
    const [year, month, day] = startDate.split('-').map(Number);
    expectedStart = fromWallClock({ year, month, day, hour: 0, minute: 0 }, zone);
  } else if (typeof startAt === 'string') expectedStart = new Date(startAt);
  else return false;
  if (!Number.isFinite(expectedStart.getTime())) return false;
  const occurrences = expandEventWithExceptions(event, expectedStart,
    new Date(expectedStart.getTime() + 1), exceptions ?? [], event.timezone);
  return occurrences.some((occurrence) =>
    new Date(occurrence.originalStart).getTime() === new Date(originalStart).getTime()
    && occurrenceStart(occurrence).getTime() === expectedStart.getTime());
}

export async function settleOutbox(admin: AdminClient, job: OutboxJob) {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('status')
    .eq('outbox_id', job.id);
  if (error) throw error;

  const statuses = (data ?? []).map((row) => row.status as Delivery['status']);
  const accepted = statuses.some((status) => status === 'TICKETED' || status === 'DELIVERED');
  const retryable = statuses.some((status) => status === 'PENDING');
  const now = new Date();

  // An HTTP request with an unknown outcome must not be automatically repeated.
  if (statuses.includes('SENDING')) return 'uncertain';

  if (retryable && job.attempts < 3) {
    now.setSeconds(now.getSeconds() + retryDelaySeconds(job.attempts));
    await checked(admin.from('notification_outbox').update({
      status: 'PENDING', claimed_at: null, next_attempt_at: now.toISOString(),
      last_error: 'Unfinished devices will be retried',
    }).eq('id', job.id));
    return 'retry';
  }

  if (retryable) await checked(admin.from('notification_deliveries').update({
    status: 'FAILED', last_error: 'Retry limit reached',
  }).eq('outbox_id', job.id).eq('status', 'PENDING'));

  if (!statuses.length || accepted) {
    await checked(admin
      .from('notification_outbox')
      .update({
        status: 'SENT',
        sent_at: now.toISOString(),
        claimed_at: null,
        last_error: retryable || statuses.some((status) => status === 'FAILED')
          ? 'Some devices rejected the notification'
          : null,
      })
      .eq('id', job.id));
    return accepted ? 'sent' : 'no-device';
  }

  await checked(admin
    .from('notification_outbox')
    .update({
      status: 'FAILED',
      claimed_at: null,
      last_error: 'No device accepted the notification',
    })
    .eq('id', job.id));
  return 'failed';
}

if (typeof Deno !== 'undefined') Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const workerSecret = requiredEnv('WORKER_SECRET');
  if (request.headers.get('x-worker-secret') !== workerSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const admin = createClient<Database>(requiredEnv('SUPABASE_URL'), secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const failures: string[] = [];
    let cleanup = { claimed: 0, removed: 0, retrying: 0 };
    try { cleanup = await cleanStorage(admin); }
    catch (error) { failures.push(`Storage cleanup: ${String(error)}`); }
    const boundsRepaired = await repairRecurrenceBounds(admin);
    const reminders = await scanReminders(admin);
    await checked(admin.from('notification_deliveries').update({
      status: 'FAILED', last_error: 'Send outcome is unknown after worker interruption; not resent to avoid duplicates',
    }).eq('status', 'SENDING').lt('sending_at', new Date(Date.now() - 300_000).toISOString()));
    let receipts = { checked: 0, delivered: 0, failed: 0 };
    try {
      receipts = await checkReceipts(admin);
    } catch (error) {
      console.error('receipt check failed', error);
      failures.push(`Receipt check: ${String(error)}`);
    }

    const { data, error } = await admin.rpc('claim_notification_outbox', { p_limit: 100 });
    if (error) throw error;

    const jobs = (data ?? []) as OutboxJob[];
    if (!jobs.length) return json({ claimed: 0, sent: 0, reminders, receipts, cleanup, boundsRepaired, failures }, failures.length ? 500 : 200);

    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const userIds = [...new Set(jobs.map((job) => job.user_id))];
    const tokens: { user_id: string; expo_token: string }[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await checked(admin.from('device_tokens').select('user_id,expo_token')
        .in('user_id', userIds).is('disabled_at', null).order('expo_token').range(offset, offset + 499));
      tokens.push(...(page ?? []));
      if (!page || page.length < 500) break;
    }

    const deliveriesToCreate = jobs.flatMap((job) =>
      (tokens ?? [])
        .filter((token) => token.user_id === job.user_id)
        .map((token) => ({ outbox_id: job.id, expo_token: token.expo_token })),
    );

    if (deliveriesToCreate.length) {
      const { error: upsertError } = await admin
        .from('notification_deliveries')
        .upsert(deliveriesToCreate, {
          onConflict: 'outbox_id,expo_token',
          ignoreDuplicates: true,
        });
      if (upsertError) throw upsertError;
    }

    const jobIds = jobs.map((job) => job.id);
    const pendingData: Delivery[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await checked(admin.from('notification_deliveries')
        .select('outbox_id,expo_token,status,attempts,ticket_id,ticketed_at')
        .in('outbox_id', jobIds).eq('status', 'PENDING').order('outbox_id').order('expo_token')
        .range(offset, offset + 499));
      pendingData.push(...((page ?? []) as Delivery[]));
      if (!page || page.length < 500) break;
    }

    let sent = 0;
    for (const batch of chunks((pendingData ?? []) as Delivery[], 100)) {
      try {
        sent += await sendBatch(admin, jobsById, batch);
      } catch (error) {
        // Never turn a ticketed/uncertain send back into PENDING here.
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    const outcomes: Record<string, number> = {};
    for (const job of jobs) {
      const outcome = await settleOutbox(admin, job);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }

    return json({ claimed: jobs.length, sent, outcomes, reminders, receipts, cleanup, boundsRepaired, failures }, failures.length ? 500 : 200);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
