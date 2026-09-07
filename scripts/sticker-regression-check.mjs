/** 스티커 삭제의 실제 소스 + 실제 QueryClient/MutationObserver를 실행한다. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import ts from 'typescript';

let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const tick = () => new Promise((resolve) => setImmediate(resolve));
const date = '2026-09-05';
const target = { id: 'sticker-a', calendarId: 'calendar-a', calendarName: '가족', calendarColor: 'test-color', date, stickerKey: 'garden-sprout' };
const otherCalendar = { ...target, id: 'sticker-b', calendarId: 'calendar-b', calendarName: '친구' };
const otherDay = { ...target, id: 'sticker-next', date: '2026-09-06' };

function load(relative, modules, fallback) {
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    if (name in modules) return modules[name];
    if (fallback) return fallback(name);
    throw new Error(`Unmocked module ${name}`);
  }, Error, Promise, console });
  return exports;
}
const catalog = load('../src/features/stickers/catalog.ts', {}, (path) => {
  assert.match(path, /assets\/stickers\/.*\.(jpg|png)$/); return path;
});

function fakeDatabase() {
  const calls = [];
  const db = { calls, response: { data: { id: target.id }, error: null }, from(table) {
    const call = { table, filters: [], selected: null, delete: false }; calls.push(call);
    const builder = {
      delete() { call.delete = true; return builder; },
      eq(column, value) { call.filters.push([column, value]); return builder; },
      select(value) { call.selected = value; return builder; },
      maybeSingle() { return Promise.resolve(db.response); },
    };
    return builder;
  } };
  return db;
}
function hookHarness() {
  const state = []; let cursor = 0;
  return {
    render(fn) { cursor = 0; return fn(); },
    react: {
      useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = value; }]; },
    },
  };
}
function fixture(confirm = async () => true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const db = fakeDatabase(); const actions = []; const notifications = []; const confirmations = [];
  const cancel = client.cancelQueries.bind(client); client.cancelQueries = async (...args) => { actions.push('cancel'); await cancel(...args); };
  const patch = client.setQueriesData.bind(client); client.setQueriesData = (...args) => { actions.push('patch'); return patch(...args); };
  const invalidate = client.invalidateQueries.bind(client); client.invalidateQueries = (...args) => { actions.push('invalidate'); return invalidate(...args); };
  let observer;
  const queries = load('../src/features/stickers/queries.ts', {
    '@tanstack/react-query': { useQueryClient: () => client, useQuery: (options) => options, useMutation: (options) => {
      observer ??= new MutationObserver(client, options);
      return { mutateAsync: observer.mutate.bind(observer) };
    } },
    '@/features/auth/auth-provider': { useAuth: () => ({ user: { id: 'user' } }) },
    '@/lib/supabase': { supabase: db },
  });
  const h = hookHarness();
  const { useStickerRemoval } = load('../src/features/stickers/use-sticker-removal.ts', {
    react: h.react, '@/features/stickers/catalog': catalog, '@/features/stickers/queries': queries,
    '@/lib/confirm': { confirm: (options) => { confirmations.push(options); return confirm(options); }, notify: (...args) => notifications.push(args) },
  });
  const { stickerKeys: keys } = queries;
  client.setQueryData(keys.day(date), [target, otherCalendar]);
  client.setQueryData(keys.day(otherDay.date), [otherDay]);
  client.setQueryData(keys.range('2026-09-01', '2026-10-01'), [target, otherCalendar, otherDay]);
  client.setQueryData(['events', 'keep'], [target]);
  return { client, db, actions, confirmations, notifications, keys,
    remove: () => queries.useRemoveDaySticker(date),
    render: () => h.render(() => useStickerRemoval(date)),
    cleanup: () => client.clear(),
  };
}

await check('삭제는 id·캘린더·날짜·현재 스티커 종류를 모두 대조', async () => {
  const f = fixture(); await f.remove().mutateAsync(target);
  assert.deepEqual(f.db.calls, [{ table: 'calendar_stickers', delete: true, selected: 'id', filters: [
    ['id', target.id], ['calendar_id', target.calendarId], ['sticker_date', date], ['sticker_key', target.stickerKey],
  ] }]);
  f.cleanup();
});
await check('삭제 0행은 성공으로 표시하지 않고 기존 캐시 유지 및 재조회', async () => {
  const f = fixture(); f.db.response = { data: null, error: null };
  await assert.rejects(f.remove().mutateAsync(target), /스티커가 바뀌었거나 제거 권한이 없습니다/);
  assert.equal(f.client.getQueryData(f.keys.day(date)).length, 2);
  assert.deepEqual(f.actions, ['invalidate']); f.cleanup();
});
await check('DB 오류를 전달하며 실패한 삭제는 캐시에서 제거하지 않음', async () => {
  const f = fixture(); const error = new Error('권한 거절'); f.db.response = { data: null, error };
  await assert.rejects(f.remove().mutateAsync(target), (actual) => actual === error);
  assert.ok(f.client.getQueryData(f.keys.day(date)).some((row) => row.id === target.id));
  assert.deepEqual(f.actions, ['invalidate']); f.cleanup();
});
await check('성공한 삭제만 일별·월별 캐시에서 즉시 제거하고 다른 날짜/캘린더/쿼리는 유지', async () => {
  const f = fixture(); await f.remove().mutateAsync(target);
  assert.deepEqual(f.client.getQueryData(f.keys.day(date)).map((row) => row.id), [otherCalendar.id]);
  assert.deepEqual(f.client.getQueryData(f.keys.day(otherDay.date)).map((row) => row.id), [otherDay.id]);
  assert.deepEqual(f.client.getQueryData(f.keys.range('2026-09-01', '2026-10-01')).map((row) => row.id), [otherCalendar.id, otherDay.id]);
  assert.deepEqual(f.client.getQueryData(['events', 'keep']), [target]);
  assert.deepEqual(f.actions, ['cancel', 'patch', 'invalidate']); f.cleanup();
});
await check('확인창 취소는 삭제를 호출하지 않고 처리 중 상태 해제', async () => {
  const f = fixture(async () => false); const result = await f.render().requestRemoval(target);
  assert.equal(result, false); assert.equal(f.db.calls.length, 0); assert.equal(f.notifications.length, 0);
  const state = f.render(); assert.equal(state.isPending, false); assert.equal(state.removingId, null);
  assert.equal(f.actions.length, 0); f.cleanup();
});
await check('확인창에 날짜·캘린더·실제 스티커 이름과 일정 유지 안내', async () => {
  const f = fixture(async () => false); await f.render().requestRemoval(target);
  assert.equal(f.confirmations[0].title, '스티커를 제거할까요?');
  assert.match(f.confirmations[0].message, /2026-09-05 · 가족/);
  assert.match(f.confirmations[0].message, /새싹 물주기/);
  assert.match(f.confirmations[0].message, /일정은 유지됩니다/);
  assert.equal(f.confirmations[0].destructive, true); assert.equal(f.confirmations[0].confirmLabel, '제거'); f.cleanup();
});
await check('같은 훅의 연속 탭은 확인/삭제 요청을 한 번만 실행', async () => {
  let approve; const f = fixture(() => new Promise((resolve) => { approve = resolve; }));
  const hook = f.render(); const first = hook.requestRemoval(target);
  assert.equal(f.render().removingId, target.id); assert.equal(f.render().isPending, true);
  assert.equal(await hook.requestRemoval(target), false);
  assert.equal(await hook.requestRemoval(otherCalendar), false);
  assert.equal(f.confirmations.length, 1); approve(true); assert.equal(await first, true);
  assert.equal(f.db.calls.length, 1); assert.equal(f.render().isPending, false); f.cleanup();
});
await check('실패를 사용자에게 알리고 잠금을 풀어 같은 항목 재시도', async () => {
  const f = fixture(); f.db.response = { data: null, error: new Error('연결이 끊겼습니다') };
  assert.equal(await f.render().requestRemoval(target), false);
  assert.deepEqual(f.notifications, [['스티커를 제거하지 못했습니다', '연결이 끊겼습니다']]);
  assert.equal(f.render().isPending, false);
  f.db.response = { data: { id: target.id }, error: null };
  assert.equal(await f.render().requestRemoval(target), true); assert.equal(f.db.calls.length, 2);
  assert.equal(f.client.getQueryData(f.keys.day(date)).length, 1); f.cleanup();
});
await check('삭제 전에 시작한 오래된 조회 응답은 제거된 스티커를 되살리지 않음', async () => {
  const f = fixture(); let finish; let aborted = false;
  const oldFetch = f.client.fetchQuery({ queryKey: f.keys.day(date), queryFn: ({ signal }) => {
    signal.addEventListener('abort', () => { aborted = true; });
    return new Promise((resolve) => { finish = resolve; });
  } }).catch(() => undefined);
  await f.remove().mutateAsync(target); assert.equal(aborted, true);
  finish([target, otherCalendar]); await oldFetch; await tick();
  assert.deepEqual(f.client.getQueryData(f.keys.day(date)).map((row) => row.id), [otherCalendar.id]); f.cleanup();
});

console.log(`${passed} sticker regression checks passed`);
