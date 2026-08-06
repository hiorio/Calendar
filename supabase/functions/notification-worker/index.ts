import { createClient } from 'npm:@supabase/supabase-js@2.110.8';

import {
  applyExceptions,
  expandEvent,
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

type AdminClient = ReturnType<typeof createClient>;
type Delivery = {
  outbox_id: number;
  expo_token: string;
  status: 'PENDING' | 'TICKETED' | 'DELIVERED' | 'FAILED';
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
  await admin
    .from('device_tokens')
    .update({ disabled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('expo_token', expoToken);
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
  const { data, error } = await admin.rpc('reminder_scan_candidates', {
    p_from: triggerFrom.toISOString(),
    p_to: triggerTo.toISOString(),
  });
  if (error) throw error;

  const candidates = (data ?? []) as ReminderCandidate[];
  if (!candidates.length) return { candidates: 0, queued: 0 };

  const eventIds = [...new Set(candidates.map((candidate) => candidate.event.id))];
  const { data: exceptionData, error: exceptionError } = await admin
    .from('event_exceptions')
    .select(
      'event_id,original_start,type,title,description,location,is_all_day,start_at,end_at,start_date,end_date',
    )
    .in('event_id', eventIds);
  if (exceptionError) throw exceptionError;
  const exceptions = (exceptionData ?? []) as EventException[];

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
    const expanded = expandEvent(candidate.event, occurrenceFrom, occurrenceTo);
    const occurrences = applyExceptions(expanded, eventExceptions);

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

async function checkReceipts(admin: AdminClient) {
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

      await admin
        .from('notification_deliveries')
        .update({
          status: 'FAILED',
          last_error: 'Expo receipt was unavailable for 24 hours',
          receipt_checked_at: now,
        })
        .eq('outbox_id', delivery.outbox_id)
        .eq('expo_token', delivery.expo_token);
      failed++;
      continue;
    }

    if (receipt.status === 'ok') {
      await admin
        .from('notification_deliveries')
        .update({ status: 'DELIVERED', last_error: null, receipt_checked_at: now })
        .eq('outbox_id', delivery.outbox_id)
        .eq('expo_token', delivery.expo_token);
      delivered++;
      continue;
    }

    const code = expoErrorCode(receipt);
    await admin
      .from('notification_deliveries')
      .update({
        status: 'FAILED',
        last_error: `${code ?? 'ExpoReceiptError'}: ${receipt.message ?? 'unknown error'}`,
        receipt_checked_at: now,
      })
      .eq('outbox_id', delivery.outbox_id)
      .eq('expo_token', delivery.expo_token);

    if (code === 'DeviceNotRegistered') {
      const userId = userByOutbox.get(delivery.outbox_id);
      if (userId) await disableToken(admin, userId, delivery.expo_token);
    }
    failed++;
  }

  return { checked: deliveries.length, delivered, failed };
}

async function sendBatch(
  admin: AdminClient,
  jobsById: Map<number, OutboxJob>,
  deliveries: Delivery[],
) {
  const messages = deliveries.map((delivery) => {
    const job = jobsById.get(delivery.outbox_id);
    if (!job) throw new Error(`Outbox ${delivery.outbox_id} was not claimed`);
    return buildPushMessage(job, delivery.expo_token);
  });

  const response = await fetch(EXPO_SEND_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify(messages satisfies ExpoPushMessage[]),
  });
  if (!response.ok) throw new Error(`Expo push HTTP ${response.status}: ${await response.text()}`);

  const result = (await response.json()) as {
    data?: Array<{
      status: 'ok' | 'error';
      id?: string;
      message?: string;
      details?: { error?: string };
    }>;
  };
  if (!Array.isArray(result.data) || result.data.length !== deliveries.length) {
    throw new Error('Expo push response length did not match the request');
  }

  const now = new Date().toISOString();

  for (let index = 0; index < deliveries.length; index++) {
    const delivery = deliveries[index];
    const ticket = result.data[index];
    const attempts = delivery.attempts + 1;

    if (ticket.status === 'ok' && ticket.id) {
      await admin
        .from('notification_deliveries')
        .update({
          status: 'TICKETED',
          attempts,
          ticket_id: ticket.id,
          ticketed_at: now,
          last_error: null,
        })
        .eq('outbox_id', delivery.outbox_id)
        .eq('expo_token', delivery.expo_token);
      continue;
    }

    const code = expoErrorCode(ticket);
    await admin
      .from('notification_deliveries')
      .update({
        status: 'FAILED',
        attempts,
        last_error: `${code ?? 'ExpoTicketError'}: ${ticket.message ?? 'unknown error'}`,
      })
      .eq('outbox_id', delivery.outbox_id)
      .eq('expo_token', delivery.expo_token);

    if (code === 'DeviceNotRegistered') {
      const userId = jobsById.get(delivery.outbox_id)?.user_id;
      if (userId) await disableToken(admin, userId, delivery.expo_token);
    }
  }

  return deliveries.length;
}

async function settleOutbox(admin: AdminClient, job: OutboxJob) {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('status')
    .eq('outbox_id', job.id);
  if (error) throw error;

  const statuses = (data ?? []).map((row) => row.status as Delivery['status']);
  const accepted = statuses.some((status) => status === 'TICKETED' || status === 'DELIVERED');
  const retryable = statuses.some((status) => status === 'PENDING');
  const now = new Date();

  if (!statuses.length || accepted) {
    await admin
      .from('notification_outbox')
      .update({
        status: 'SENT',
        sent_at: now.toISOString(),
        claimed_at: null,
        last_error: statuses.some((status) => status === 'FAILED')
          ? 'Some devices rejected the notification'
          : null,
      })
      .eq('id', job.id);
    return accepted ? 'sent' : 'no-device';
  }

  if (retryable && job.attempts < 3) {
    now.setSeconds(now.getSeconds() + retryDelaySeconds(job.attempts));
    await admin
      .from('notification_outbox')
      .update({
        status: 'PENDING',
        claimed_at: null,
        next_attempt_at: now.toISOString(),
        last_error: 'Expo push request will be retried',
      })
      .eq('id', job.id);
    return 'retry';
  }

  await admin
    .from('notification_outbox')
    .update({
      status: 'FAILED',
      claimed_at: null,
      last_error: 'No device accepted the notification',
    })
    .eq('id', job.id);
  return 'failed';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const workerSecret = requiredEnv('WORKER_SECRET');
  if (request.headers.get('x-worker-secret') !== workerSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const admin = createClient(requiredEnv('SUPABASE_URL'), secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const reminders = await scanReminders(admin);
    let receipts = { checked: 0, delivered: 0, failed: 0 };
    try {
      receipts = await checkReceipts(admin);
    } catch (error) {
      console.error('receipt check failed', error);
    }

    const { data, error } = await admin.rpc('claim_notification_outbox', { p_limit: 100 });
    if (error) throw error;

    const jobs = (data ?? []) as OutboxJob[];
    if (!jobs.length) return json({ claimed: 0, sent: 0, reminders, receipts });

    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const userIds = [...new Set(jobs.map((job) => job.user_id))];
    const { data: tokens, error: tokenError } = await admin
      .from('device_tokens')
      .select('user_id,expo_token')
      .in('user_id', userIds)
      .is('disabled_at', null);
    if (tokenError) throw tokenError;

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
    const { data: pendingData, error: pendingError } = await admin
      .from('notification_deliveries')
      .select('outbox_id,expo_token,status,attempts,ticket_id,ticketed_at')
      .in('outbox_id', jobIds)
      .eq('status', 'PENDING');
    if (pendingError) throw pendingError;

    let sent = 0;
    for (const batch of chunks((pendingData ?? []) as Delivery[], 100)) {
      try {
        sent += await sendBatch(admin, jobsById, batch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const delivery of batch) {
          await admin
            .from('notification_deliveries')
            .update({ attempts: delivery.attempts + 1, last_error: message })
            .eq('outbox_id', delivery.outbox_id)
            .eq('expo_token', delivery.expo_token);
        }
      }
    }

    const outcomes: Record<string, number> = {};
    for (const job of jobs) {
      const outcome = await settleOutbox(admin, job);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }

    return json({ claimed: jobs.length, sent, outcomes, reminders, receipts });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
