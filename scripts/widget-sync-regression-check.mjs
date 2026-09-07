/** Execute the actual sync hook with isolated query/store/native adapters. No WidgetKit claims. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

register('./ts-resolve.mjs', pathToFileURL('./scripts/'));
const dateUtils = await import('../src/lib/date.ts');
const eventTime = await import('../src/lib/event-time.ts');
const layout = await import('../src/features/calendar/month-layout.ts');
const colors = await import('../src/features/calendars/colors.ts');
const policy = await import('../src/features/widgets/widget-policy.ts');

let passed = 0;
function check(name, test) { test(); passed++; console.log(`  PASS  ${name}`); }
const entries = [];
const errors = [];
const timers = new Map();
let timerId = 0;
let failCalendarClear = false;
let failCalendarPublish = false;
function widget(name) {
  return {
    updateSnapshot(props) {
      entries.push({ name, method: 'snapshot', props });
      if (name === 'calendar' && failCalendarClear) { failCalendarClear = false; throw new Error('native temporarily unavailable'); }
    },
    updateTimeline(timeline) {
      entries.push({ name, method: 'timeline', timeline });
      if (name === 'calendar' && failCalendarPublish) { failCalendarPublish = false; throw new Error('timeline temporarily unavailable'); }
    },
  };
}

const stores = {
  widgets: { calendarMode: 'custom', selectedCalendarIds: ['allowed'], quickAddCalendarId: null, showQuickActions: true },
  filter: { hidden: [] },
  theme: { theme: 'apricot', schemePreference: 'system' },
};
let hydrated = false;
const persist = { hasHydrated: () => hydrated, onHydrate: () => () => {}, onFinishHydration: () => () => {} };
function storeHook(name) { const hook = (select) => select(stores[name]); hook.persist = persist; return hook; }

let user = { id: 'A' };
let calendars = [
  { id: 'allowed', name: '선택', color: colors.DEFAULT_CALENDAR_COLOR },
  { id: 'private', name: '비공개', color: colors.DEFAULT_CALENDAR_COLOR },
];
const day = dateUtils.toDateKey(new Date());
const event = (id, calendar_id) => ({
  id, key: id, calendar_id, title: `${calendar_id} event`, calendarName: calendar_id,
  displayColor: colors.DEFAULT_CALENDAR_COLOR, is_all_day: true, start_date: day, end_date: day,
  start_at: null, end_at: null, timezone: 'Asia/Seoul', originalStart: `${day}T00:00:00Z`,
});
let events = [
  event('a', 'allowed'),
  event('b', 'allowed'),
  event('c', 'allowed'),
  event('d', 'allowed'),
  event('p', 'private'),
];
let memos = [
  { id: 'am', calendar_id: 'allowed', content: 'allowed memo', done: false, calendarName: '선택', calendarColor: colors.DEFAULT_CALENDAR_COLOR },
  { id: 'pm', calendar_id: 'private', content: 'private memo', done: false, calendarName: '비공개', calendarColor: colors.DEFAULT_CALENDAR_COLOR },
];

const slots = [];
let cursor = 0;
let pendingEffects = [];
const equalDeps = (first, second) => first?.length === second?.length && first.every((value, index) => Object.is(value, second[index]));
const react = {
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useMemo(factory, deps) { const index = cursor++; if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; },
  useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
  useEffect(effect, deps) {
    const index = cursor++;
    if (!slots[index] || !equalDeps(slots[index].deps, deps)) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      pendingEffects.push(() => { slots[index].cleanup = effect(); });
    }
  },
};
const palette = { background: 'background', text: 'text', accent: 'accent' };
const mocks = {
  react,
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  'expo-linking': { createURL: (path, options) => `app://${path}${options ? `?${JSON.stringify(options.queryParams)}` : ''}` },
  '@/constants/theme': { ThemePalettes: { apricot: { light: palette, dark: palette } } },
  '@/features/auth/auth-provider': { useAuth: () => ({ user }) },
  '@/features/calendar/month-layout': layout,
  '@/features/calendars/colors': colors,
  '@/features/calendars/queries': { useMyCalendars: () => ({ data: calendars }) },
  '@/features/events/queries': { useMonthEvents: () => ({ data: events, isFetched: events !== undefined }) },
  '@/features/memos/queries': { useMemos: () => ({ data: memos }) },
  '@/lib/date': dateUtils,
  '@/lib/event-time': eventTime,
  '@/stores/calendar-filter': { useCalendarFilter: storeHook('filter') },
  '@/stores/calendar-preference': { useCalendarPreference: () => ({ weekStart: 'sunday' }) },
  '@/stores/theme-preference': { useThemePreference: storeHook('theme') },
  '@/stores/widget-preference': { useWidgetPreference: storeHook('widgets') },
  '@/lib/observability': { Sentry: { captureException: (error) => errors.push(error) } },
  './timeflower-widgets': { CalendarWidget: widget('calendar'), QuickMemoWidget: widget('memo') },
  './widget-policy': policy,
};
const code = ts.transpileModule(readFileSync('src/features/widgets/widget-sync.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(
  (name) => { assert.ok(name in mocks, `Missing ${name}`); return mocks[name]; }, module, module.exports,
  (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
  (id) => timers.delete(id),
);
function render() {
  cursor = 0;
  pendingEffects = [];
  entries.length = 0;
  module.exports.WidgetSync();
  pendingEffects.forEach((effect) => effect());
}
function lastTimeline(name = 'calendar') { return entries.findLast((entry) => entry.name === name && entry.method === 'timeline')?.timeline; }

check('unhydrated custom/filter settings never publish query data', () => {
  render();
  assert.deepEqual(entries.map((entry) => entry.method), ['snapshot', 'snapshot']);
  assert.ok(entries.every((entry) => entry.props.events.length === 0 && entry.props.memos.length === 0));
});
check('hydrated custom selection publishes only allowed events and memos across all timeline entries', () => {
  hydrated = true;
  render();
  const timeline = lastTimeline();
  assert.ok(timeline.length > 8);
  for (const entry of timeline) {
    assert.ok(entry.props.events.every((item) => item.title === 'allowed event'));
    assert.ok(entry.props.memos.every((item) => item.content === 'allowed memo'));
    assert.equal(entry.props.monthWeeks.length, 6);
    assert.equal(entry.props.monthWeeks.flatMap((week) => week.days).length, 42);
    if (!entry.props.expired) {
      assert.equal(entry.props.adjacentMonthPages.length, 2);
      assert.equal(new Set([
        entry.props.monthKey,
        ...entry.props.adjacentMonthPages.map((page) => page.key),
      ]).size, 3);
    }
  }
  const today = timeline[0].props.monthWeeks.flatMap((week) => week.days)
    .find((item) => item.key === day);
  assert.equal(today.hiddenEventCount, 2);
  assert.equal(timeline.at(-1).props.expired, true);
});
check('privacy scope reduction clears both widgets while the event query is unavailable', () => {
  stores.widgets.selectedCalendarIds = [];
  events = undefined;
  render();
  assert.deepEqual(entries.map((entry) => [entry.name, entry.method]), [['calendar', 'snapshot'], ['memo', 'snapshot']]);
  assert.ok(entries.every((entry) => entry.props.events.length === 0 && entry.props.memos.length === 0));
});
check('empty custom selection remains empty after queries recover', () => {
  events = [event('a', 'allowed'), event('p', 'private')];
  render();
  assert.ok(lastTimeline().every((entry) => entry.props.events.length === 0 && entry.props.memos.length === 0));
});
check('failure clearing one native widget does not skip the other or publish data', () => {
  stores.widgets.selectedCalendarIds = ['allowed'];
  failCalendarClear = true;
  render();
  assert.deepEqual(entries.map((entry) => [entry.name, entry.method]), [['calendar', 'snapshot'], ['memo', 'snapshot']]);
  assert.equal(lastTimeline(), undefined);
  assert.equal(errors.length, 1);
});
check('transient clear failure retries the same privacy scope before publishing', () => {
  const retry = [...timers].find(([, item]) => item.ms === 1000);
  assert.ok(retry);
  timers.delete(retry[0]);
  retry[1].callback();
  render();
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.method), ['snapshot', 'snapshot']);
  assert.ok(lastTimeline());
});
check('calendar publication failure does not block memo publication and retries without query changes', () => {
  events = [...events];
  failCalendarPublish = true;
  render();
  assert.ok(lastTimeline('memo'));
  const retry = [...timers].find(([, item]) => item.ms === 1000);
  assert.ok(retry);
  timers.delete(retry[0]);
  retry[1].callback();
  render();
  assert.ok(lastTimeline());
  assert.ok(lastTimeline('memo'));
  assert.equal(entries.filter((entry) => entry.method === 'snapshot').length, 0);
});
check('signout clears previous snapshots even with cached query data still present', () => {
  user = null;
  render();
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.method === 'snapshot' && entry.props.events.length === 0));
});
check('account switch with unavailable calendars leaves cleared snapshots', () => {
  user = { id: 'B' };
  calendars = undefined;
  render();
  assert.equal(entries.length, 2);
  assert.equal(lastTimeline(), undefined);
});

slots.forEach((slot) => slot?.cleanup?.());
assert.equal(timers.size, 0);
console.log(`\nWidget sync regressions: ${passed} passed`);
