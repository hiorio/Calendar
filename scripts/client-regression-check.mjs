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

const continuityStore = storage();
const continuity = load('src/features/auth/auth-continuity.ts', {
  '@react-native-async-storage/async-storage': { default: continuityStore },
});
await check('auth continuity keeps the last installation user without storing credentials', async () => {
  await continuity.saveAuthContinuity({ id: 'existing-user', is_anonymous: false });
  const remembered = await continuity.loadAuthContinuity();
  assert.equal(remembered.userId, 'existing-user');
  assert.equal(remembered.isAnonymous, false);
  assert.equal('access_token' in remembered, false);
  await continuity.clearAuthContinuity();
  assert.equal(await continuity.loadAuthContinuity(), null);
});

const snapshotStore = storage();
const snapshotCache = load('src/features/calendar/home-snapshot-cache.ts', {});
const homeSnapshot = load('src/features/calendar/home-snapshot.ts', {
  '@react-native-async-storage/async-storage': { default: snapshotStore },
  '@/features/calendar/home-snapshot-cache': snapshotCache,
});
await check('calendar snapshot owner remains readable before auth recovery', async () => {
  const snapshot = {
    key: '2026-09:sunday',
    savedAt: '2026-09-11T00:00:00.000Z',
    marksByDate: {
      '2026-09-11': [
        { id: 'event', title: '보존된 일정', color: '#1B54A8', isAllDay: true },
      ],
    },
    stickersByDate: {},
  };
  await homeSnapshot.saveHomeMonthSnapshot('existing-user', snapshot);
  assert.equal(await homeSnapshot.loadHomeSnapshotOwnerId(), 'existing-user');
  assert.deepEqual(
    await homeSnapshot.loadHomeMonthSnapshot('existing-user', '2026-09:sunday'),
    snapshot,
  );
});

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
await check('missing auth renders the calendar tabs instead of redirecting to account', () => {
  const navigations = [];
  function Tabs() {}
  Tabs.Screen = 'TabsScreen';
  const appLayout = load('src/app/(app)/_layout.tsx', {
    '@expo/vector-icons/Ionicons': { default: 'Ionicons' },
    'expo-router': { Tabs, router: { push: (href) => navigations.push(href) } },
    'react/jsx-runtime': jsx,
    'react-native': {
      Platform: { OS: 'ios', select: (values) => values.ios ?? values.default },
      StyleSheet: { create: (values) => values, hairlineWidth: 1 },
    },
    '@/components/ui/preferred-text-style': { usePreferredTextStyle: () => ({}) },
    '@/constants/theme': { Typography: { caption: {} } },
    '@/features/auth/auth-provider': {
      useAuth: () => ({ session: null, isLoading: false }),
    },
    '@/hooks/use-theme': {
      useTheme: () => ({
        colors: {
          accent: 'accent',
          textTertiary: 'tertiary',
          chrome: 'chrome',
          chromeBorder: 'border',
        },
      }),
    },
  }).default;

  const tree = appLayout();
  assert.equal(tree.type, Tabs);
  const addTab = tree.props.children.find((child) => child.props.name === 'new');
  let prevented = false;
  addTab.props.listeners.tabPress({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(navigations[0].pathname, '/account');
});
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

function createDateTimeFieldHarness(style, fieldProps = {}) {
  const harness = hooks();
  const changes = [];
  const component = load('src/components/ui/date-time-field.tsx', {
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
    react: harness.react,
    'react/jsx-runtime': jsx,
    'react-native': {
      Platform: { OS: 'ios' },
      Pressable: 'Pressable',
      StyleSheet: { create: (values) => values },
      View: 'View',
    },
    '@/components/ui/text': { Txt: 'Txt' },
    '@/constants/theme': { Radius: { sm: 8 }, Spacing: { md: 12, lg: 16, sm: 8 } },
    '@/features/experiments/time-picker-lab-picker': {
      TimePickerLabPicker: 'TimePickerLabPicker',
    },
    '@/hooks/use-theme': {
      useTheme: () => ({
        colors: { surfacePressed: 'pressed', surfaceMuted: 'muted' },
      }),
    },
    '@/lib/event-time': {
      formatDate: () => '2026. 9. 15.',
      formatTime: () => '오후 2:35',
    },
    '@/stores/time-picker-preference': {
      useTimePickerPreference: (selector) => selector({ style }),
    },
  }).DateTimeField;

  const value = new Date(2026, 8, 15, 14, 35);
  const render = (mode = 'time') =>
    harness.render(() =>
      component({
        label: '시작',
        value,
        mode,
        onChange: (next) => changes.push(next),
        ...fieldProps,
      }),
    );

  return { changes, render };
}

await check('iOS 기본형과 날짜 입력은 기존 compact 선택기를 유지한다', () => {
  const system = createDateTimeFieldHarness('system');
  const systemTree = system.render('time');
  const systemPicker = find(systemTree, (node) => node.type === 'DateTimePicker');
  assert.equal(systemPicker.props.mode, 'time');
  assert.equal(systemPicker.props.display, 'compact');
  assert.equal(find(systemTree, (node) => node.type === 'TimePickerLabPicker'), null);

  const customDate = createDateTimeFieldHarness('digit-auto');
  const dateTree = customDate.render('date');
  assert.equal(find(dateTree, (node) => node.type === 'DateTimePicker').props.mode, 'date');
  assert.equal(find(dateTree, (node) => node.type === 'TimePickerLabPicker'), null);
});

await check('iOS A형은 전용 다이얼을 열고 취소하면 값을 바꾸지 않는다', () => {
  const aType = createDateTimeFieldHarness('digit-auto');
  let tree = aType.render();
  find(tree, (node) => node.type === 'Pressable').props.onPress();
  tree = aType.render();
  const picker = find(tree, (node) => node.type === 'TimePickerLabPicker');
  assert.equal(picker.props.variant, 'digit-auto');
  assert.equal(picker.props.purpose, 'event');
  picker.props.onCancel();
  tree = aType.render();
  assert.equal(find(tree, (node) => node.type === 'TimePickerLabPicker'), null);
  assert.deepEqual(aType.changes, []);
});

await check('iOS B형은 확인한 시각을 한 번만 일정 폼에 반영한다', () => {
  const bType = createDateTimeFieldHarness('digit-composed');
  let tree = bType.render();
  find(tree, (node) => node.type === 'Pressable').props.onPress();
  tree = bType.render();
  const picker = find(tree, (node) => node.type === 'TimePickerLabPicker');
  assert.equal(picker.props.variant, 'digit-composed');
  assert.equal(picker.props.purpose, 'event');
  const confirmed = new Date(2026, 8, 15, 15, 47);
  picker.props.onConfirm(confirmed);
  tree = bType.render();
  assert.equal(find(tree, (node) => node.type === 'TimePickerLabPicker'), null);
  assert.deepEqual(bType.changes, [confirmed]);
});

await check('iOS C형도 길게 눌러 확장하는 전용 다이얼로 연결한다', () => {
  const cType = createDateTimeFieldHarness('digit-hold');
  let tree = cType.render();
  find(tree, (node) => node.type === 'Pressable').props.onPress();
  tree = cType.render();
  const picker = find(tree, (node) => node.type === 'TimePickerLabPicker');
  assert.equal(picker.props.variant, 'digit-hold');
  assert.equal(picker.props.purpose, 'event');
});

await check('설정 체험은 저장값 대신 지정한 실제 선택기를 열어 샘플 시각에만 반영한다', () => {
  const customPreview = createDateTimeFieldHarness('system', {
    timePickerStyleOverride: 'digit-hold',
    timePickerPurpose: 'preview',
  });
  let tree = customPreview.render();
  find(tree, (node) => node.type === 'Pressable').props.onPress();
  tree = customPreview.render();
  const picker = find(tree, (node) => node.type === 'TimePickerLabPicker');
  assert.equal(picker.props.variant, 'digit-hold');
  assert.equal(picker.props.purpose, 'preview');
  const previewValue = new Date(2026, 8, 15, 16, 52);
  picker.props.onConfirm(previewValue);
  assert.deepEqual(customPreview.changes, [previewValue]);

  const systemPreview = createDateTimeFieldHarness('digit-auto', {
    timePickerStyleOverride: 'system',
    timePickerPurpose: 'preview',
  });
  const systemTree = systemPreview.render();
  assert.equal(find(systemTree, (node) => node.type === 'DateTimePicker').props.display, 'compact');
  assert.equal(find(systemTree, (node) => node.type === 'TimePickerLabPicker'), null);
});

await check('정식 설정에서 기본형·A형·B형·C형을 직접 체험한 뒤 별도로 선택한다', () => {
  const preferences = readFileSync(
    new URL('../src/app/preferences.tsx', import.meta.url),
    'utf8',
  );
  const more = readFileSync(new URL('../src/app/(app)/settings.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/app/time-picker-lab.tsx', import.meta.url), 'utf8');
  const options = source.match(/const STYLE_DEFINITIONS:[\s\S]*?= \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.match(options, /id:\s*'system'/);
  assert.match(options, /id:\s*'digit-auto'/);
  assert.match(options, /id:\s*'digit-composed'/);
  assert.match(options, /id:\s*'digit-hold'/);
  assert.match(source, /timePickerStyleOverride=\{definition\.id\}/);
  assert.match(source, /timePickerPurpose="preview"/);
  assert.match(source, /onPreviewChange=\{setPreviewValue\}/);
  assert.match(source, /onSelect=\{\(\) => setSelectedStyle\(definition\.id\)\}/);
  assert.match(source, /accessibilityRole="radiogroup"/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /accessibilityState=\{\{ checked: selected \}\}/);
  assert.match(source, /label=\{selected \? '현재 사용 중' : '이 방식 사용'\}/);
  assert.match(preferences, /router\.push\('\/time-picker-lab'/);
  assert.match(more, /router\.push\('\/time-picker-lab'/);
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
