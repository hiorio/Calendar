/** Actual client modules executed with isolated storage/network/React adapters. No real requests. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
let passed = 0;
async function check(name, run) {
  await run();
  passed += 1;
  console.log(`  PASS  ${name}`);
}
function load(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
  });
  const module = { exports: {} };
  const require = (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Missing mock ${name} in ${path}`);
  };
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
  return module.exports;
}
function storage() {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
    multiRemove: async (keys) => { keys.forEach((key) => values.delete(key)); },
  };
}
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

const pendingKey = 'auth.pendingGuestDataTransfer.v1';
const store = storage();
let currentUser = { id: 'G1', is_anonymous: true };
let claimCalls = 0;
let claimError = null;
const guestMocks = {
  '@react-native-async-storage/async-storage': { default: store },
  '@/lib/supabase': { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: currentUser } }, error: null }) },
    rpc: async (name) => {
      if (name === 'prepare_guest_data_transfer') return { data: 'transfer-token', error: null };
      claimCalls++;
      return { data: claimError ? null : { transferred: 1 }, error: claimError };
    },
  } },
};
let guest = load('src/features/auth/guest-data-transfer.ts', guestMocks);
await check('unbound transfer is never claimed by a restored account', async () => {
  await guest.prepareGuestDataTransfer('G1');
  currentUser = { id: 'A', is_anonymous: false };
  assert.equal(await guest.claimPendingGuestDataTransfer('A'), null);
  assert.equal(claimCalls, 0);
});
await check('failed claim retains the intended target account across restart', async () => {
  await guest.bindPendingGuestDataTransfer('G1', 'A');
  claimError = { message: 'network timeout' };
  await assert.rejects(guest.claimPendingGuestDataTransfer('A'), /로그인은 완료/);
  assert.equal(JSON.parse(await store.getItem(pendingKey)).targetUserId, 'A');
  guest = load('src/features/auth/guest-data-transfer.ts', guestMocks);
  currentUser = { id: 'B', is_anonymous: false };
  assert.equal(await guest.claimPendingGuestDataTransfer('B'), null);
  assert.equal(claimCalls, 1);
});
await check('new guest discard cannot remove the old targeted claim', async () => {
  await guest.discardPendingGuestDataTransfer('G2');
  assert.equal(JSON.parse(await store.getItem(pendingKey)).targetUserId, 'A');
  await assert.rejects(guest.bindPendingGuestDataTransfer('G1', 'B'), /다른 계정/);
});
await check('lost response recovery only retries as the bound account', async () => {
  currentUser = { id: 'A', is_anonymous: false };
  claimError = null;
  assert.deepEqual(await guest.claimPendingGuestDataTransfer('A'), { transferred: 1 });
  assert.equal(await store.getItem(pendingKey), null);
  assert.equal(claimCalls, 2);
});
await check('legacy records without a target are not auto-migrated to the current user', async () => {
  await store.setItem(pendingKey, JSON.stringify({ token: 'old', guestUserId: 'G1', preparedAt: new Date().toISOString() }));
  assert.equal(await guest.claimPendingGuestDataTransfer('A'), null);
  assert.equal(claimCalls, 2);
});

const authWeb = load('src/features/notifications/push.web.ts', { '@/lib/supabase': guestMocks['@/lib/supabase'] });
await check('account switch waits until a bound transfer operation has finished', async () => {
  const waiting = deferred();
  const actions = [];
  const transfer = authWeb.withCurrentAuthSession('A', async () => { actions.push('claim'); await waiting.promise; actions.push('claimed'); });
  const signout = authWeb.withPushUnregisteredForSessionEnd('A', async () => { actions.push('signout'); currentUser = { id: 'G2', is_anonymous: true }; });
  await tick();
  assert.deepEqual(actions, ['claim']);
  waiting.resolve();
  await Promise.all([transfer, signout]);
  assert.deepEqual(actions, ['claim', 'claimed', 'signout']);
  await assert.rejects(authWeb.withCurrentAuthSession('A', async () => { throw new Error('must not run'); }), /현재 사용자가 다릅니다/);
});

const memoRows = Array.from({ length: 1205 }, (_, id) => ({ id: String(id), content: `memo ${id}`, done: false, calendars: null }));
const ranges = [];
let mutationResult = { data: [], error: null };
const memoModule = load('src/features/memos/queries.ts', {
  '@tanstack/react-query': { useQuery: (options) => options, useMutation: (options) => options, useQueryClient: () => ({ invalidateQueries: async () => {} }) },
  '@/features/auth/auth-provider': { useAuth: () => ({ user: { id: 'A' } }) },
  '@/features/calendars/colors': { DEFAULT_CALENDAR_COLOR: 'palette-color' },
  '@/lib/supabase': { supabase: { from: () => {
    let range = [0, 0];
    let mutation = false;
    const builder = {
      select: () => builder, order: () => builder, eq: () => builder,
      update: () => { mutation = true; return builder; },
      delete: () => { mutation = true; return builder; },
      range: (start, end) => { range = [start, end]; ranges.push(range); return builder; },
      abortSignal: () => builder,
      then: (resolve) => Promise.resolve(mutation ? mutationResult : { data: memoRows.slice(range[0], range[1] + 1), error: null }).then(resolve),
    };
    return builder;
  } } },
});
await check('memo pages retain rows beyond PostgREST 1000-row default', async () => {
  const rows = await memoModule.useMemos().queryFn({ signal: new AbortController().signal });
  assert.equal(rows.length, 1205);
  assert.equal(rows.at(-1).content, 'memo 1204');
  assert.deepEqual(ranges, [[0, 249], [250, 499], [500, 749], [750, 999], [1000, 1249]]);
  assert.equal(rows[0].calendarName, '알 수 없는 캘린더');
});
await check('memo update and delete cannot report success after RLS returns zero rows', async () => {
  await assert.rejects(memoModule.useToggleMemo().mutationFn({ id: 'missing', done: true }), /수정 권한/);
  await assert.rejects(memoModule.useDeleteMemo().mutationFn('missing'), /삭제 권한/);
  mutationResult = { data: [{ id: 'ok' }], error: null };
  await memoModule.useToggleMemo().mutationFn({ id: 'ok', done: true });
  await memoModule.useDeleteMemo().mutationFn('ok');
});

const pushStore = storage();
await pushStore.setItem('push.expoToken', 'this-installation');
let permission = { granted: true, status: 'granted', ios: { status: 2 } };
let deviceResult = { data: { disabled_at: null }, error: null };
const filters = [];
const push = load('src/features/notifications/push.ts', {
  '@react-native-async-storage/async-storage': { default: pushStore },
  expo: { isRunningInExpoGo: () => false },
  'expo-constants': { default: {} },
  'expo-notifications': { getPermissionsAsync: async () => permission, IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 } },
  'react-native': { Platform: { OS: 'ios' } },
  '@/lib/supabase': { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'A' } } }, error: null }) },
    from: () => {
      const builder = {
        select: () => builder,
        eq: (key, value) => { filters.push([key, value]); return builder; },
        maybeSingle: async () => deviceResult,
      };
      return builder;
    },
  } },
});
await check('device status queries only this installation and owner', async () => {
  assert.deepEqual(await push.getDevicePushState('A'), { supported: true, permission: 'allowed', registered: true, locallyEnabled: true });
  assert.deepEqual(filters, [['user_id', 'A'], ['expo_token', 'this-installation']]);
});
await check('disabled token and denied OS permission are represented separately', async () => {
  deviceResult = { data: { disabled_at: '2026-09-05' }, error: null };
  permission = { granted: false, status: 'denied', ios: { status: 1 } };
  assert.deepEqual(await push.getDevicePushState('A'), { supported: true, permission: 'denied', registered: false, locallyEnabled: true });
});
await check('device status query failures are not reported as unregistered', async () => {
  deviceResult = { data: null, error: new Error('connection failed') };
  await assert.rejects(push.getDevicePushState('A'), /connection failed/);
});

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const native = { StyleSheet: { create: (value) => value }, Platform: { OS: 'web' }, View: 'View', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView' };
function hooks() {
  const slots = [];
  const cleanups = [];
  let index = 0;
  return {
    cleanups,
    render: (component) => { index = 0; return component(); },
    react: {
      useState: (initial) => { const key = index++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial; return [slots[key], (value) => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
      useRef: (initial) => { const key = index++; return slots[key] ??= { current: initial }; },
      useMemo: (factory) => factory(),
      useEffect: (effect) => { const key = index++; if (!(key in slots)) { slots[key] = true; cleanups.push(effect()); } },
    },
  };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
function componentMocks(react) {
  const mocks = { react, 'react/jsx-runtime': jsx, 'react-native': native,
    '@/hooks/use-theme': { useTheme: () => ({ colors: {}, scheme: 'light' }) },
    '@/constants/theme': { Spacing: {}, Radius: {}, Typography: {} },
  };
  for (const [path, name] of [['button', 'Button'], ['card', 'Card'], ['empty-state', 'EmptyState'], ['field', 'Field'], ['segmented', 'Segmented'], ['screen', 'Content'], ['text', 'Txt']]) mocks[`@/components/ui/${path}`] = { [name]: name };
  return mocks;
}
await check('keyboard plus button submits one quick event and completion cannot pop an unmounted screen', async () => {
  const harness = hooks();
  const request = deferred();
  let writes = 0;
  let backs = 0;
  const component = load('src/app/quick-event.tsx', {
    ...componentMocks(harness.react),
    'expo-router': { router: { back: () => { backs++; } }, useLocalSearchParams: () => ({}) },
    '@/features/calendars/queries': { useMyCalendars: () => ({ data: [{ id: 'calendar', name: '개인' }] }) },
    '@/features/events/queries': { useCreateEvent: () => ({ mutateAsync: async () => { writes++; await request.promise; } }) },
    '@/features/widgets/quick-calendar-picker': { QuickCalendarPicker: 'QuickCalendarPicker' },
    '@/lib/event-time': { formatDate: () => '', formatTime: () => '', quickEventTime: (start) => ({ start, end: start }), startOfDay: (value) => value, toTimeColumns: () => ({}) },
  }).default;
  let tree = harness.render(component);
  find(tree, (node) => node.type === 'Field').props.onChangeText('새 일정');
  tree = harness.render(component);
  find(tree, (node) => node.type === 'Field').props.onSubmitEditing();
  find(tree, (node) => node.type === 'Button' && node.props.label === '일정 추가').props.onPress();
  assert.equal(writes, 1);
  harness.cleanups.forEach((cleanup) => cleanup?.());
  request.resolve();
  await tick();
  assert.equal(backs, 0);
});

const sync = load('src/features/sync/query-sync.tsx', {
  ...componentMocks({}),
  '@tanstack/react-query': {},
  expo: { requireOptionalNativeModule: () => null },
  '@/features/auth/auth-provider': {},
  '@/features/calendar/home-snapshot': {},
});
await check('network recovery and shared refresh include comments/stickers but exclude unrelated local data', () => {
  assert.equal(sync.isNetworkOnline({ isConnected: false }), false);
  assert.equal(sync.isNetworkOnline({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(sync.isNetworkOnline({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(sync.isNetworkOnline({}), true);
  assert.equal(sync.isSharedQuery(['comments', 'event']), true);
  assert.equal(sync.isSharedQuery(['calendar-stickers', 'range']), true);
  assert.equal(sync.isSharedQuery(['device-calendars']), false);
});

await check('common field passes its visible label and hint to accessibility', () => {
  const field = load('src/components/ui/field.tsx', {
    ...componentMocks({ useState: () => [false, () => {}] }),
    'react-native': { ...native, TextInput: 'TextInput' },
    './preferred-text-style': { usePreferredTextStyle: () => ({}) },
  });
  const tree = field.Field({ label: '일정 제목', hint: '120자까지' });
  const input = find(tree, (node) => node.type === 'TextInput');
  assert.equal(input.props.accessibilityLabel, '일정 제목');
  assert.equal(input.props.accessibilityHint, '120자까지');
});

// Real QueryClient verifies cancelled/cleared data is not revived by a late network response.
await check('shared query reset removes cached data after membership is revoked', async () => {
  const { QueryClient, QueryObserver } = nodeRequire('@tanstack/react-query');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const request = deferred();
  queryClient.setQueryData(['events', 'private'], { title: 'private event' });
  const observer = new QueryObserver(queryClient, { queryKey: ['events', 'private'], queryFn: () => request.promise });
  const stop = observer.subscribe(() => {});
  await queryClient.cancelQueries({ predicate: (query) => sync.isSharedQuery(query.queryKey) });
  const reset = queryClient.resetQueries({ predicate: (query) => sync.isSharedQuery(query.queryKey) });
  assert.equal(queryClient.getQueryData(['events', 'private']), undefined);
  request.reject(new Error('access revoked'));
  await reset;
  assert.equal(queryClient.getQueryData(['events', 'private']), undefined);
  stop();
  queryClient.clear();
});

console.log(`\nClient regressions: ${passed} passed`);
