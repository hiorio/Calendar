// Runs the actual worker functions with controlled DB/network failures. No push
// request or user data leaves this process; DB security is tested separately.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as recurrence from '../src/lib/recurrence.ts';
import * as timezone from '../src/lib/timezone.ts';
import * as push from '../supabase/functions/_shared/push.ts';

const source = await readFile(new URL('../supabase/functions/notification-worker/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let network;
const worker = {};
new Function('require', 'exports', 'Deno', 'fetch', compiled)(
  (name) => name.startsWith('npm:') ? {} : name.includes('recurrence') ? recurrence : name.includes('timezone') ? timezone : push,
  worker, { env: { get: () => undefined }, serve() {} }, (...args) => network(...args),
);

const job = { id: 1, user_id: 'user-a', type: 'EVENT_UPDATED', attempts: 1, payload: { calendar_id: 'cal', event_id: 'event', title: '개인 일정' } };
const delivery = (token = 'token-a', status = 'PENDING') => ({ outbox_id: 1, expo_token: token, status, attempts: 0, ticket_id: null, ticketed_at: null });

function mock({ deliveries = [delivery()], allowed = true, fail, storageError = null, cleanup = [], events = [], exceptions = [] } = {}) {
  const tables = { notification_deliveries: structuredClone(deliveries), notification_outbox: [structuredClone(job)], storage_cleanup_jobs: structuredClone(cleanup), device_tokens: [], events: structuredClone(events), event_exceptions: structuredClone(exceptions) };
  const calls = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (name === 'claim_storage_cleanup') return { data: tables.storage_cleanup_jobs, error: null };
      const row = tables.notification_deliveries.find((item) => item.outbox_id === args.p_outbox_id && item.expo_token === args.p_expo_token);
      if (!allowed) { if (row) row.status = 'FAILED'; return { data: false, error: null }; }
      if (!row || row.status !== 'PENDING') return { data: false, error: null };
      row.status = 'SENDING'; row.attempts++;
      return { data: true, error: null };
    },
    storage: { from: () => ({ remove: async () => ({ data: [], error: storageError }) }) },
    from(table) {
      let patch;
      let single = false;
      const filters = [];
      const query = {
        select() { return query; }, update(value) { patch = value; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        is(key, value) { return query.eq(key, value); }, maybeSingle() { single = true; return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        not() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; },
        then(resolve, reject) {
          const call = { table, patch }; calls.push(call);
          const error = fail?.(call);
          if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
          const rows = tables[table].filter((row) => filters.every((predicate) => predicate(row)));
          if (patch) rows.forEach((row) => Object.assign(row, patch));
          return Promise.resolve({ data: structuredClone(single ? rows[0] ?? null : rows), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { admin, tables, calls };
}

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await test('다기기 일부 성공 + PENDING은 남은 기기를 재시도', async () => {
  const { admin, tables } = mock({ deliveries: [delivery('a', 'TICKETED'), delivery('b')] });
  assert.equal(await worker.settleOutbox(admin, job), 'retry');
  assert.equal(tables.notification_outbox[0].status, 'PENDING');
});
await test('최종 시도에서는 미완료 기기도 종료', async () => {
  const { admin, tables } = mock({ deliveries: [delivery('a', 'TICKETED'), delivery('b')] });
  assert.equal(await worker.settleOutbox(admin, { ...job, attempts: 3 }), 'sent');
  assert.equal(tables.notification_deliveries[1].status, 'FAILED');
});
await test('토큰 소유권/구성원 재검증 거절이면 전송 0회', async () => {
  const { admin, calls } = mock({ allowed: false });
  network = () => { throw new Error('must not send'); };
  assert.equal(await worker.sendBatch(admin, new Map([[1, job]]), [delivery()]), 0);
  assert.equal(calls[0].rpc, 'begin_notification_delivery');
});
await test('큐 생성 이후 회차 취소/이동은 오래된 리마인더 전송을 막음', async () => {
  const event = { id: 'event', calendar_id: 'cal', title: '일정', description: null, location: null,
    is_all_day: false, start_at: '2026-01-01T09:00:00.000Z', end_at: '2026-01-01T10:00:00.000Z',
    start_date: null, end_date: null, timezone: 'UTC', rrule: 'FREQ=DAILY;COUNT=1', deleted_at: null };
  const reminder = { ...job, type: 'REMINDER', payload: { ...job.payload, original_start: event.start_at,
    start_at: event.start_at, start_date: null, is_all_day: false, timezone: 'UTC' } };
  const { admin, tables } = mock({ events: [event] });
  assert.equal(await worker.isCurrentReminder(admin, reminder), true);
  tables.event_exceptions.push({ event_id: 'event', original_start: event.start_at, type: 'CANCELLED',
    title: null, description: null, location: null, is_all_day: null, start_at: null, end_at: null, start_date: null, end_date: null });
  assert.equal(await worker.isCurrentReminder(admin, reminder), false);
  Object.assign(tables.event_exceptions[0], { type: 'MODIFIED', start_at: '2026-03-01T12:00:00.000Z', end_at: '2026-03-01T13:00:00.000Z' });
  assert.equal(await worker.isCurrentReminder(admin, reminder), false);
  assert.equal(await worker.isCurrentReminder(admin, { ...reminder, payload: { ...reminder.payload, start_at: '2026-03-01T12:00:00.000Z' } }), true);
});
await test('Expo 성공 뒤 기록 오류는 성공 집계하지 않고 SENDING 보존', async () => {
  const { admin, tables } = mock({ fail: ({ patch }) => patch?.status === 'TICKETED' ? new Error('DB timeout') : null });
  let sent = 0;
  network = async () => { sent++; return Response.json({ data: [{ status: 'ok', id: 'ticket-one' }] }); };
  await assert.rejects(worker.sendBatch(admin, new Map([[1, job]]), [delivery()]), /persistence failed/);
  assert.equal(sent, 1);
  assert.equal(tables.notification_deliveries[0].status, 'SENDING');
  assert.equal(await worker.settleOutbox(admin, job), 'uncertain');
});
await test('일시 DB 실패는 같은 ticket만 다시 기록하고 push는 1회', async () => {
  let saves = 0; let sent = 0;
  const { admin, tables } = mock({ fail: ({ patch }) => patch?.status === 'TICKETED' && ++saves === 1 ? new Error('transient DB') : null });
  network = async () => { sent++; return Response.json({ data: [{ status: 'ok', id: 'ticket-one' }] }); };
  assert.equal(await worker.sendBatch(admin, new Map([[1, job]]), [delivery()]), 1);
  assert.equal(sent, 1);
  assert.equal(tables.notification_deliveries[0].ticket_id, 'ticket-one');
});
await test('일부 ticket 기록 실패도 다른 기기의 ticket 기록을 계속함', async () => {
  const { admin, tables } = mock({ deliveries: [delivery('a'), delivery('b')], fail: ({ patch }) => patch?.ticket_id === 'ticket-a' ? new Error('DB a') : null });
  network = async () => Response.json({ data: [{ status: 'ok', id: 'ticket-a' }, { status: 'ok', id: 'ticket-b' }] });
  await assert.rejects(worker.sendBatch(admin, new Map([[1, job]]), [delivery('a'), delivery('b')]));
  assert.equal(tables.notification_deliveries[1].ticket_id, 'ticket-b');
});
await test('명시적인 HTTP 503은 재시도 가능 상태로 보존', async () => {
  const { admin, tables } = mock();
  network = async () => new Response('', { status: 503 });
  assert.equal(await worker.sendBatch(admin, new Map([[1, job]]), [delivery()]), 0);
  assert.equal(tables.notification_deliveries[0].status, 'PENDING');
});
await test('네트워크 응답 유실은 자동 재발송하지 않음', async () => {
  const { admin, tables } = mock();
  network = async () => { throw new Error('connection reset'); };
  await assert.rejects(worker.sendBatch(admin, new Map([[1, job]]), [delivery()]), /connection reset/);
  assert.equal(tables.notification_deliveries[0].status, 'SENDING');
});
await test('outbox 기록 오류를 성공으로 반환하지 않음', async () => {
  const { admin } = mock({ deliveries: [delivery('a', 'TICKETED')], fail: ({ table, patch }) => table === 'notification_outbox' && patch ? new Error('DB outbox') : null });
  await assert.rejects(worker.settleOutbox(admin, job), /DB outbox/);
});
await test('receipt 기록 오류를 전달 완료로 집계하지 않음', async () => {
  const row = { ...delivery('a', 'TICKETED'), ticket_id: 'ticket-one', ticketed_at: new Date(Date.now() - 3600000).toISOString() };
  const { admin } = mock({ deliveries: [row], fail: ({ patch }) => patch?.status === 'DELIVERED' ? new Error('DB receipt') : null });
  network = async () => Response.json({ data: { 'ticket-one': { status: 'ok' } } });
  await assert.rejects(worker.checkReceipts(admin), /DB receipt/);
});
await test('Storage 실패는 경로와 재시도 상태를 남김', async () => {
  const { admin, tables } = mock({ cleanup: [{ id: 2, bucket_id: 'calendar-media', storage_path: 'cal/file.pdf', attempts: 1 }], storageError: new Error('Storage unavailable') });
  assert.deepEqual(await worker.cleanStorage(admin), { claimed: 1, removed: 0, retrying: 1 });
  assert.equal(tables.storage_cleanup_jobs[0].status, 'PENDING');
  assert.equal(tables.storage_cleanup_jobs[0].storage_path, 'cal/file.pdf');
});
await test('Storage 삭제 후 DB 실패는 완료 성공으로 보고하지 않음', async () => {
  const { admin } = mock({ cleanup: [{ id: 2, bucket_id: 'calendar-media', storage_path: 'cal/file.pdf', attempts: 1 }], fail: ({ patch }) => patch?.status === 'DONE' ? new Error('DB cleanup') : null });
  await assert.rejects(worker.cleanStorage(admin), /DB cleanup/);
});
console.log(`Notification regressions: ${passed} passed`);
