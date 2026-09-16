/** 실제 시간 모듈과 쿼리/폼 소스를 실행한다. DB·네이티브 화면 검증은 별도다. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

register('./ts-resolve.mjs', pathToFileURL('./scripts/'));
const time = await import('../src/lib/event-time.ts');
const recurrence = await import('../src/lib/recurrence.ts');
const dates = await import('../src/lib/date.ts');
const originalTz = process.env.TZ;
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const tick = () => new Promise((resolve) => setImmediate(resolve));
const master = (patch = {}) => ({
  id: 'master', calendar_id: 'calendar', title: '원래 제목', location: '원래 장소', description: '원래 메모',
  is_all_day: false, start_at: '2026-01-01T00:00:00.000Z', end_at: '2026-01-01T01:00:00.000Z',
  start_date: null, end_date: null, timezone: 'Asia/Seoul', rrule: 'FREQ=DAILY;COUNT=3',
  rrule_until: '2026-01-03T01:00:00.000Z', range_start: '2026-01-01T00:00:00Z', range_end: '2026-01-03T01:00:00Z',
  deleted_at: null, color: null, calendars: { name: '테스트', color: '#9AA1AC' }, ...patch,
});
const exception = (patch = {}) => ({
  event_id: 'master', original_start: '2026-01-02T00:00:00.000Z', type: 'MODIFIED',
  title: null, location: null, description: null, is_all_day: null,
  start_at: null, end_at: null, start_date: null, end_date: null, ...patch,
});

await check('400회를 넘는 UNTIL의 실제 마지막 종료', () => {
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=DAILY;UNTIL=20271231T235900' })), '2027-12-31T01:00:00.000Z');
});
await check('COUNT 1000도 화면 전개 상한과 무관', () => {
  const expected = new Date(Date.parse('2026-01-01T01:00:00Z') + 999 * 86400000).toISOString();
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=DAILY;COUNT=1000' })), expected);
});
await check('지나치게 큰 유한 규칙은 잘린 종료일 대신 열린 범위로 처리', () => {
  const start = performance.now();
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=SECONDLY;COUNT=100000000' })), null);
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=SECONDLY;UNTIL=20991231T235900' })), null);
  assert.ok(performance.now() - start < 5000, '고빈도 규칙 계산은 수십 년을 전개하지 않아야 한다');
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=DAILY;COUNT=10000' })), new Date(Date.parse('2026-01-01T01:00:00Z') + 9999 * 86400000).toISOString());
});
await check('첫 회차부터 이후 삭제한 빈 반복은 무한 종료가 아님', () => {
  assert.equal(recurrence.computeRruleUntil(master({ rrule: 'FREQ=DAILY;UNTIL=20251231T235900' })), '2026-01-01T00:00:00.000Z');
});
await check('뉴욕 DST를 지나는 종일 반복의 달력 일수', () => {
  process.env.TZ = 'America/New_York';
  const event = master({ is_all_day: true, start_at: null, end_at: null, start_date: '2026-03-07', end_date: '2026-03-09', timezone: 'America/New_York', rrule: 'FREQ=WEEKLY;COUNT=3' });
  const rows = recurrence.expandEventWithExceptions(event, new Date(2026, 2, 14), new Date(2026, 2, 17), []);
  assert.equal(rows.length, 1);
  assert.deepEqual(time.eventDayKeys(rows[0]), ['2026-03-14', '2026-03-15', '2026-03-16']);
  assert.equal(recurrence.computeRruleUntil(event), '2026-03-24T04:00:00.000Z');
  const moved = time.moveStart(time.fromTimeColumns(event), new Date(2026, 2, 14));
  assert.equal(dates.toDateKey(moved.end), '2026-03-16');
});
await check('서울 종일 회차를 뉴욕 기기에서도 같은 날짜로 복원', () => {
  const event = master({ is_all_day: true, start_at: null, end_at: null, start_date: '2026-01-01', end_date: '2026-01-03' });
  const next = time.occurrenceTime(event, '2026-03-13T15:00:00Z');
  assert.equal(next.start_date, '2026-03-14'); assert.equal(next.end_date, '2026-03-16');
});
await check('일별 시간창 밖에서 옮겨 온 회차의 실제 시각', () => {
  const moved = exception({ start_at: '2026-03-05T03:00:00Z', end_at: '2026-03-05T04:00:00Z' });
  const rows = recurrence.expandEventWithExceptions(master(), new Date('2026-03-05T02:59:00Z'), new Date('2026-03-05T03:01:00Z'), [moved]);
  assert.equal(rows.length, 1); assert.equal(rows[0].originalStart, moved.original_start); assert.equal(rows[0].start_at, moved.start_at);
  assert.equal(recurrence.expandEventWithExceptions(master(), new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T01:00:00Z'), [moved]).length, 0);
});
await check('취소/삭제 이후의 예외를 다시 나타내지 않고 중복하지 않음', () => {
  const moved = exception({ start_at: '2026-01-03T00:00:00Z', end_at: '2026-01-03T01:00:00Z' });
  assert.equal(recurrence.expandEventWithExceptions(master(), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-04T00:00:00Z'), [moved]).length, 3);
  assert.equal(recurrence.expandEventWithExceptions(master({ rrule: 'FREQ=DAILY;COUNT=1' }), new Date('2026-01-03T00:00:00Z'), new Date('2026-01-04T00:00:00Z'), [moved]).length, 0);
});
await check('시간 지정 회차를 종일로 바꾸면 한 가지 시간 모양만 유지', () => {
  const modified = exception({ is_all_day: true, start_date: '2026-03-05', end_date: '2026-03-06' });
  const [row] = recurrence.expandEventWithExceptions(master(), new Date(2026, 2, 5), new Date(2026, 2, 7), [modified]);
  assert.equal(row.is_all_day, true); assert.equal(row.start_at, null); assert.equal(row.end_at, null);
  assert.deepEqual(time.eventDayKeys(row), ['2026-03-05', '2026-03-06']);
});
await check('종일 회차를 시간 지정으로 바꾸면 date 컬럼은 비움', () => {
  const event = master({ is_all_day: true, start_at: null, end_at: null, start_date: '2026-01-01', end_date: '2026-01-01' });
  const modified = exception({ original_start: '2026-01-01T15:00:00Z', is_all_day: false, start_at: '2026-03-05T03:00:00Z', end_at: '2026-03-05T04:00:00Z' });
  const [row] = recurrence.expandEventWithExceptions(event, new Date('2026-03-05T03:00:00Z'), new Date('2026-03-05T04:00:00Z'), [modified]);
  assert.equal(row.is_all_day, false); assert.equal(row.start_date, null); assert.equal(row.end_date, null);
});
await check('UTC 워커에서 한국 자정 종일 리마인더 후보를 보존', () => {
  process.env.TZ = 'UTC';
  const event = master({ is_all_day: true, start_at: null, end_at: null, start_date: '2026-01-01', end_date: '2026-01-01' });
  const rows = recurrence.expandEventWithExceptions(event, new Date('2026-01-01T14:59:00Z'), new Date('2026-01-01T15:01:00Z'), [], 'Asia/Seoul');
  assert.ok(rows.some((row) => row.start_date === '2026-01-02'));
});
await check('명시적 장소/메모 비움과 기존 null 상속을 구별', () => {
  const seed = { ...master(), originalStart: '2026-01-02T00:00:00Z' };
  assert.equal(recurrence.applyExceptions([seed], [exception({ location: '', description: '' })])[0].location, '');
  assert.equal(recurrence.applyExceptions([seed], [exception()])[0].location, '원래 장소');
});

function load(relative, modules) {
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    if (!(name in modules)) throw new Error(`Unmocked module ${name}`);
    return modules[name];
  }, console, Date, Map, Set, Promise, window: { addEventListener() {}, removeEventListener() {} } });
  return exports;
}
function harness() {
  const state = []; let cursor = 0; let effects = [];
  return {
    render(fn) { cursor = 0; effects = []; const out = fn(); for (const effect of effects) effect(); return out; },
    react: {
      forwardRef: (fn) => fn,
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
      useCallback: (fn) => fn,
      useEffect: (fn) => { effects.push(fn); },
      useImperativeHandle: (ref, fn) => { if (ref) ref.current = fn(); },
    },
  };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
const rn = { StyleSheet: { create: (styles) => styles, hairlineWidth: 1 }, Platform: { OS: 'web' }, View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView' };
const theme = { Radius: {}, Spacing: {}, Typography: { title: {} } };
const common = {
  'react/jsx-runtime': jsx, 'react-native': rn,
  '@expo/vector-icons/Ionicons': { default: 'Ionicons' }, 'expo-image': { Image: 'Image' },
  '@/components/ui/button': { Button: 'Button' }, '@/components/ui/card': { Divider: 'Divider' },
  '@/components/ui/date-time-field': { DateTimeField: 'DateTimeField' },
  '@/components/ui/preferred-text-style': { usePreferredTextStyle: () => ({}) },
  '@/components/ui/text': { Txt: 'Txt' }, '@/constants/theme': theme,
  '@/features/calendars/colors': { calendarColorForScheme: (color) => color },
  '@/hooks/use-theme': { useTheme: () => ({ colors: {}, scheme: 'light' }) },
  '@/lib/date': dates, '@/lib/event-time': time, '@/lib/recurrence': recurrence,
};
function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  const children = [node.props?.children].flat(Infinity);
  return [node, ...children.flatMap(descendants)];
}
function mountForm(initial, overrides = {}) {
  const h = harness(); const ref = { current: null }; const inputs = [];
  const { EventForm } = load('../src/features/events/event-form.tsx', { ...common, react: h.react });
  const props = { initial, calendars: [{ id: 'calendar', name: '테스트' }], submitLabel: '저장', onSubmit: async (input) => { inputs.push(input); }, ...overrides };
  const render = () => h.render(() => EventForm(props, ref));
  return { render, ref, inputs, props };
}
const values = (event, extra = {}) => ({ calendarId: 'calendar', title: event.title, location: event.location, description: event.description,
  time: time.fromTimeColumns(event), recurrence: recurrence.parseRrule(event.rrule), rawRrule: event.rrule, timezone: event.timezone, ...extra });
await check('종료일 당일 09시에도 전체 저장 가능하고 해외 제목 수정은 RRULE/타임존 보존', async () => {
  process.env.TZ = 'Asia/Seoul';
  const event = master({ start_at: '2026-09-05T13:00:00Z', end_at: '2026-09-05T14:00:00Z', timezone: 'America/New_York', rrule: 'FREQ=DAILY;UNTIL=20260905T235900;BYHOUR=9' });
  const form = mountForm(values(event)); form.render(); form.ref.current.submit(); await tick();
  assert.equal(form.inputs.length, 1); assert.equal(form.inputs[0].timezone, 'America/New_York');
  assert.equal(form.inputs[0].rrule, event.rrule); assert.equal(form.inputs[0].start_at, '2026-09-05T13:00:00.000Z');
});
await check('THIS 수정에는 잠긴 반복 종료 검증을 적용하지 않음', async () => {
  const form = mountForm(values(master(), { time: time.fromTimeColumns(master({ start_at: '2026-09-05T00:00:00Z', end_at: '2026-09-05T01:00:00Z' })), recurrence: { freq: 'DAILY', until: new Date(2026, 0, 3) } }), { lockRecurrence: true });
  form.render(); form.ref.current.submit(); await tick(); assert.equal(form.inputs.length, 1);
});
await check('폼 저장 진입점 자체가 중복 제출과 pending/blocked 저장을 막음', async () => {
  let resolve; let calls = 0;
  const form = mountForm(values(master()), { onSubmit: () => { calls++; return new Promise((done) => { resolve = done; }); } });
  form.render(); form.ref.current.submit(); form.ref.current.submit(); assert.equal(calls, 1); resolve(); await tick();
  form.props.pending = true; form.render(); form.ref.current.submit(); assert.equal(calls, 1);
  form.props.pending = false; form.props.submitDisabled = true; form.render(); form.ref.current.submit(); assert.equal(calls, 1);
});
await check('폼 입력 변경과 저장 기준 갱신으로 이탈 보호 상태를 결정', () => {
  const changes = []; const form = mountForm(values(master()), { onDirtyChange: (dirty) => changes.push(dirty) });
  const tree = form.render(); assert.equal(form.ref.current.isDirty(), false);
  descendants(tree).find((node) => node.type === 'TextInput').props.onChangeText('변경');
  form.render(); assert.equal(form.ref.current.isDirty(), true);
  form.ref.current.markSaved(); form.render(); assert.equal(form.ref.current.isDirty(), false); assert.ok(changes.includes(true));
});

function mockDatabase(events, exceptions) {
  const calls = []; let mutation;
  return { calls, get mutation() { return mutation; }, from(table) {
    const filters = []; const orders = []; let start = 0; let end = Infinity; let columns;
    const builder = {
      select(value) { columns = value; return builder; },
      is(field, value) { filters.push((row) => row[field] === value); return builder; },
      eq(field, value) { filters.push((row) => row[field] === value); return builder; },
      in(field, values) { filters.push((row) => values.includes(row[field])); return builder; },
      lt(field, value) { filters.push((row) => row[field] < value); return builder; },
      ilike(field, value) { const needle = value.slice(1, -1).replace(/\\([%_])/g, '$1').toLowerCase(); filters.push((row) => (row[field] ?? '').toLowerCase().includes(needle)); return builder; },
      or(value) {
        if (table === 'events') { const lower = value.split('range_end.gt.')[1]; filters.push((row) => row.range_end === null || row.range_end > lower); }
        else {
          const timed = value.match(/and\(start_at\.lt\.(.*?),end_at\.gt\.(.*?)\)/);
          const allDay = value.match(/and\(start_date\.lte\.(.*?),end_date\.gte\.(.*?)\)/);
          filters.push((row) => (row.start_at && row.end_at && Date.parse(row.start_at) < Date.parse(timed[1]) && Date.parse(row.end_at) > Date.parse(timed[2])) || (row.start_date && row.end_date && row.start_date <= allDay[1] && row.end_date >= allDay[2]));
        }
        return builder;
      },
      order(field, { ascending = true } = {}) { orders.push({ field, ascending }); return builder; },
      range(from, to) { start = from; end = to; return builder; },
      limit(count) { end = count - 1; return builder; },
      upsert(input) { mutation = input; return builder; },
      then(resolve) {
        calls.push({ table, start, end, columns });
        const rows = [...(table === 'events' ? events : exceptions)].filter((row) => filters.every((filter) => filter(row)));
        rows.sort((a, b) => { for (const { field, ascending } of orders) { const order = String(a[field]).localeCompare(String(b[field])); if (order) return ascending ? order : -order; } return 0; });
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve);
      },
    };
    return builder;
  } };
}
function queries(db) {
  return load('../src/features/events/queries.ts', {
    '@/features/auth/auth-provider': { useAuth: () => ({ user: { id: 'user' } }) },
    '@tanstack/react-query': { useQuery: (options) => options, useMutation: (options) => options, useQueryClient: () => ({ invalidateQueries: () => {} }) },
    '@/lib/date': dates, '@/lib/event-time': time, '@/lib/recurrence': recurrence, '@/lib/supabase': { supabase: db },
  });
}
await check('API 1000행을 넘는 월간 마스터도 고유 ID 페이지로 모두 표시', async () => {
  const events = Array.from({ length: 1101 }, (_, index) => master({ id: `event-${`${index}`.padStart(4, '0')}`, rrule: null, start_at: '2026-03-05T03:00:00Z', end_at: '2026-03-05T04:00:00Z', range_start: '2026-03-05T03:00:00Z', range_end: '2026-03-05T04:00:00Z' }));
  const db = mockDatabase(events, []); const result = await queries(db).useMonthEvents(new Date(2026, 2, 1)).queryFn();
  assert.equal(result.length, 1101); assert.equal(new Set(result.map((row) => row.key)).size, 1101);
  assert.ok(db.calls.some((call) => call.table === 'events' && call.start === 1000));
});
await check('마스터 range 밖에서 이동한 예외를 별도 조회하고 1000개 예외도 모두 적용', async () => {
  const events = [master({ rrule: 'FREQ=DAILY;COUNT=2000', range_end: '2031-06-23T01:00:00Z' }), master({ id: 'outside' })];
  const exceptions = Array.from({ length: 1101 }, (_, index) => {
    const at = new Date(Date.parse('2026-01-01T00:00:00Z') + index * 86400000).toISOString();
    return exception({ original_start: at, type: 'CANCELLED' });
  });
  exceptions.push(exception({ event_id: 'outside', is_all_day: true, start_date: '2026-03-05', end_date: '2026-03-05' }));
  const db = mockDatabase(events, exceptions); const result = await queries(db).useMonthEvents(new Date(2026, 2, 1)).queryFn();
  assert.equal(result.length, 1); assert.equal(result[0].id, 'outside'); assert.equal(result[0].is_all_day, true);
  assert.ok(db.calls.some((call) => call.table === 'event_exceptions' && call.start === 1000));
  assert.ok(db.calls.filter((call) => call.table === 'event_exceptions').every((call) => call.columns.includes('is_all_day')));
});
await check('회차 제목 검색은 변경 시각과 original_start를 갖고 삭제된 마스터는 제외', async () => {
  const moved = exception({ title: '회차 변경 제목', start_at: '2026-03-05T03:00:00Z', end_at: '2026-03-05T04:00:00Z' });
  const db = mockDatabase([master(), master({ id: 'deleted', deleted_at: '2026-02-01T00:00:00Z' })], [moved, exception({ event_id: 'deleted', title: '회차 변경 제목' })]);
  const result = await queries(db).useEventSearch('회차 변경').queryFn();
  assert.equal(result.length, 1); assert.equal(result[0].originalStart, moved.original_start); assert.equal(result[0].start_at, moved.start_at);
});
await check('회차 저장 쿼리가 빈 입력을 null 상속 대신 빈 문자열로 기록', async () => {
  const db = mockDatabase([], []); await queries(db).useUpdateOccurrence('master').mutationFn({ originalStart: '2026-01-02T00:00:00Z', input: { ...master(), description: null, location: null } });
  assert.equal(db.mutation.description, ''); assert.equal(db.mutation.location, '');
});

await check('9월 회차에서 전체 범위로 바꾸면 1월 마스터 날짜와 값을 사용', async () => {
  const h = harness(); const event = master({ rrule: 'FREQ=DAILY;COUNT=1000' });
  const { default: Screen } = load('../src/app/event-edit.tsx', {
    ...common, react: h.react, 'expo-router': { useLocalSearchParams: () => ({ id: 'master', occ: '2026-09-05T00:00:00Z' }) },
    '@/components/ui/screen': { Content: 'Content' }, '@/components/ui/segmented': { Segmented: 'Segmented' },
    '@/features/calendars/queries': { useMyCalendars: () => ({ data: [{ id: 'calendar' }] }) },
    '@/features/events/event-detail-tools': { EventDetailTools: 'EventDetailTools' },
    '@/features/events/event-editor-header': { EventEditorHeader: 'EventEditorHeader' },
    '@/features/events/event-form': { EventForm: 'EventForm' },
    '@/features/events/use-event-editor-exit': { useEventEditorExit: () => ({ finish: () => {}, savingRef: { current: false } }) },
    '@/features/events/queries': { useEvent: () => ({ data: event }), useOccurrenceException: () => ({ isFetched: true, data: exception({ title: '회차만 다른 제목' }) }), useUpdateEvent: () => ({}), useUpdateOccurrence: () => ({}), useDeleteEvent: () => ({}) },
    '@/lib/confirm': { confirm: async () => true },
  });
  let tree = h.render(Screen);
  assert.equal(descendants(tree).find((node) => node.type === 'EventForm').props.initial.time.start.toISOString(), '2026-09-05T00:00:00.000Z');
  descendants(tree).find((node) => node.type === 'Segmented').props.onChange('ALL'); await tick(); tree = h.render(Screen);
  const initial = descendants(tree).find((node) => node.type === 'EventForm').props.initial;
  assert.equal(initial.time.start.toISOString(), event.start_at); assert.equal(initial.title, event.title); assert.equal(initial.timezone, event.timezone);
  assert.equal(recurrence.computeRruleUntil({ ...event, ...time.toTimeColumns(initial.time, initial.timezone) }), recurrence.computeRruleUntil(event));
});
await check('저장 중 이탈 차단, 입력 포기 확인, 늦은 완료의 다른 화면 닫기 차단', async () => {
  const h = harness(); let callback; let allow = false; let focused = true; let pops = 0; let dispatched = 0;
  const { useEventEditorExit } = load('../src/features/events/use-event-editor-exit.ts', {
    react: h.react, 'react-native': rn,
    'expo-router': { router: { back: () => { pops++; } }, useNavigation: () => ({ isFocused: () => focused, dispatch: () => { dispatched++; } }) },
    'expo-router/react-navigation': { usePreventRemove: (_, listener) => { callback = listener; } },
    '@/lib/confirm': { confirm: async () => allow },
  });
  h.render(() => useEventEditorExit(true, true)); callback({ data: { action: {} } }); await tick(); assert.equal(dispatched, 0);
  let guard = h.render(() => useEventEditorExit(false, true)); callback({ data: { action: {} } }); await tick(); assert.equal(dispatched, 0);
  allow = true; callback({ data: { action: {} } }); await tick(); assert.equal(dispatched, 1);
  focused = false; guard.finish(); assert.equal(pops, 0);
  focused = true; guard = h.render(() => useEventEditorExit(false, true)); guard.finish(); guard.finish(); assert.equal(pops, 1);
});

if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
console.log(`${passed} event regression checks passed`);
