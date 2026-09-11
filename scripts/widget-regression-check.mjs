/** Execute Expo's serialized widget layouts; this is not a substitute for an Xcode/device render. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transformSync } from '@babel/core';
import ts from 'typescript';

register('./ts-resolve.mjs', pathToFileURL('./scripts/'));
const { visibleCalendarIds, widgetTimelineDates } = await import('../src/features/widgets/widget-policy.ts');
const { buildMonthMatrix, toDateKey } = await import('../src/lib/date.ts');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let passed = 0;
function check(name, run) { run(); passed++; console.log(`  PASS  ${name}`); }

check('widget deep links keep the calendar behind dismissible day and event modals', () => {
  const sourceText = read('src/app/_layout.tsx');
  const sourceFile = ts.createSourceFile(
    'src/app/_layout.tsx',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const settingsDeclaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ))
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => declaration.name.getText(sourceFile) === 'unstable_settings');
  assert.ok(
    settingsDeclaration && ts.isObjectLiteralExpression(settingsDeclaration.initializer),
    'root layout must export an unstable_settings object for cold widget deep links',
  );

  const anchorProperty = settingsDeclaration.initializer.properties.find(
    (property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'anchor',
  );
  assert.ok(anchorProperty && ts.isPropertyAssignment(anchorProperty));
  assert.ok(ts.isStringLiteralLike(anchorProperty.initializer));
  assert.equal(anchorProperty.initializer.text, '(app)');

  const modalRoutes = new Set();
  const attribute = (element, name) => element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === 'Stack.Screen') {
      const nameAttribute = attribute(node, 'name');
      const optionsAttribute = attribute(node, 'options');
      const routeName = nameAttribute?.initializer;
      const options = optionsAttribute?.initializer;
      if (
        routeName && ts.isStringLiteral(routeName) &&
        options && ts.isJsxExpression(options) && ts.isObjectLiteralExpression(options.expression)
      ) {
        const presentation = options.expression.properties.find(
          (property) => ts.isPropertyAssignment(property) &&
            property.name.getText(sourceFile) === 'presentation',
        );
        if (
          presentation && ts.isPropertyAssignment(presentation) &&
          ts.isStringLiteralLike(presentation.initializer) && presentation.initializer.text === 'modal'
        ) {
          modalRoutes.add(routeName.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  assert(modalRoutes.has('day'), 'the widget day route must remain a modal');
  assert(modalRoutes.has('event/[id]'), 'the widget event route must remain a modal');
});

check('empty and unavailable custom calendars never fall back to all', () => {
  const calendars = [{ id: 'private' }, { id: 'shared' }];
  assert.deepEqual([...visibleCalendarIds(calendars, 'custom', [], [])], []);
  assert.deepEqual([...visibleCalendarIds(calendars, 'custom', ['removed'], [])], []);
  assert.deepEqual([...visibleCalendarIds(calendars, 'custom', ['shared'], [])], ['shared']);
  assert.deepEqual([...visibleCalendarIds(calendars, 'app', [], ['private'])], ['shared']);
});
check('daily timeline has no 7-day gap and expires at the fetched month boundary', () => {
  const now = new Date(2026, 8, 5, 12);
  const { dates, expiresAt } = widgetTimelineDates(now, new Date(2026, 9, 1), []);
  assert.equal(dates.length, 26);
  assert.equal(toDateKey(dates.at(-1)), '2026-09-30');
  assert.equal(toDateKey(expiresAt), '2026-10-01');
});
check('timeline is bounded, deduplicated, ordered and crosses month/year boundaries', () => {
  const now = new Date(2026, 11, 25, 12);
  const end = +new Date(2026, 11, 25, 13);
  const { dates, expiresAt } = widgetTimelineDates(now, new Date(2027, 1, 1), [end, end, +now - 1]);
  assert.equal(dates.length, 33);
  assert.equal(toDateKey(expiresAt), '2027-01-26');
  assert(dates.every((date, i) => i === 0 || date > dates[i - 1]));
});

const componentNames = ['HStack', 'Image', 'Link', 'RoundedRectangle', 'Spacer', 'Text', 'VStack', 'ZStack'];
const modifierNames = ['background', 'buttonStyle', 'containerBackground', 'containerRelativeFrame', 'contentShape', 'cornerRadius', 'font',
  'foregroundStyle', 'frame', 'labelStyle', 'lineLimit', 'minimumScaleFactor', 'offset', 'padding', 'privacySensitive', 'widgetURL'];
const components = Object.fromEntries(componentNames.map((name) => [name, `${name}View`]));
components.Button = ({ onPress, ...props }) => ({ type: 'Button', key: null, props: { ...props, onButtonPress: onPress } });
const modifiers = Object.fromEntries(modifierNames.map((name) => [name, (...args) => ({ name, args })]));
modifiers.shapes = { rectangle: () => ({ type: 'rectangle' }) };
// Use the installed widget runtime's real child flattening / JSX adapter.
const jsxModule = { exports: {} };
new Function('require', 'exports', ts.transpileModule(read('node_modules/expo-widgets/bundle/jsx-runtime-stub.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(() => ({ Fragment: 'react.fragment' }), jsxModule.exports);
const compiled = transformSync(read('src/features/widgets/timeflower-widgets.tsx'), {
  filename: 'src/features/widgets/timeflower-widgets.tsx', babelrc: false, configFile: false,
  presets: ['babel-preset-expo'], caller: { name: 'metro', platform: 'ios', supportsStaticESM: true, isDev: false },
}).code;
const commonJS = transformSync(compiled, { babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const widgetModule = { exports: {} };
const mocks = { 'expo-widgets': { createWidget: (_name, layout) => layout }, '@expo/ui/swift-ui': components,
  '@expo/ui/swift-ui/modifiers': modifiers, 'react/jsx-runtime': jsxModule.exports };
new Function('require', 'module', 'exports', commonJS)((name) => {
  assert(name in mocks, `unexpected import: ${name}`); return mocks[name];
}, widgetModule, widgetModule.exports);
const layouts = Object.fromEntries(Object.entries(widgetModule.exports).map(([name, source]) => {
  assert.equal(typeof source, 'string', 'Expo must serialize the widget directive');
  return [name, runInNewContext(`(${source})`, { ...components, ...modifiers, ...jsxModule.exports, Date })];
}));
const nativeTypes = new Set([...read('node_modules/expo-widgets/ios/Widgets/DynamicView.swift')
  .matchAll(/case "([^"]+)":/g)].map((match) => match[1]));
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function validate(tree) {
  for (const node of nodes(tree)) assert(nativeTypes.has(node.type), `unsupported native view ${node.type}`);
  assert.doesNotThrow(() => JSON.stringify(tree));
}
function press(tree, target) {
  const button = nodes(tree).find((node) => node.type === 'Button' && node.props.target === target);
  assert.ok(button, `missing widget button: ${target}`);
  return button.props.onButtonPress();
}
const colorNames = ['background', 'surface', 'surfaceMuted', 'text', 'textSecondary', 'textTertiary',
  'onAccent', 'accent', 'accentSoft', 'border', 'sunday', 'saturday'];
const colors = Object.fromEntries(colorNames.map((name) => [name, `test-${name}`]));
function pageFor(month, weekStart) {
  const normalized = new Date(month.getFullYear(), month.getMonth(), 1);
  return {
    key: toDateKey(normalized).slice(0, 7),
    title: `${normalized.getFullYear()}년 ${normalized.getMonth() + 1}월`,
    shortTitle: `${normalized.getMonth() + 1}월`,
    weeks: buildMonthMatrix(normalized, weekStart).map((week) => ({ key: toDateKey(week[0]),
      days: week.map((day) => ({ key: toDateKey(day), number: day.getDate(), weekday: day.getDay(),
        inMonth: day.getMonth() === normalized.getMonth(), isToday: +day === +normalized, events: [], eventCount: 0,
        hiddenEventCount: 0, url: `/day?date=${toDateKey(day)}` })),
      lanes: [[], [], []],
    })),
  };
}
function propsFor(month, weekStart = 'sunday') {
  const current = pageFor(month, weekStart);
  const previous = pageFor(new Date(month.getFullYear(), month.getMonth() - 1, 1), weekStart);
  const next = pageFor(new Date(month.getFullYear(), month.getMonth() + 1, 1), weekStart);
  return {
    layoutRevision: 2,
    palettes: { light: colors, dark: colors }, preferredScheme: 'system',
    dateTitle: '8월 토', weekdayTitle: '토요일', dayNumber: '1', monthTitle: current.title, monthShortTitle: current.shortTitle,
    monthKey: current.key, selectedMonthKey: current.key, todayMonthKey: current.key,
    adjacentMonthPages: [previous, next],
    weekdayLabels: weekStart === 'sunday' ? ['일', '월', '화', '수', '목', '금', '토'] : ['월', '화', '수', '목', '금', '토', '일'],
    monthWeeks: current.weeks,
    events: [], memos: [], upcomingEventCount: 0, calendarUrl: '/', quickEventUrl: '/quick-event',
    quickMemoUrl: '/quick-memo', memosUrl: '/memos', showQuickActions: true, viewName: 'test',
  };
}
const env = { date: new Date(2026, 7, 1), colorScheme: 'light', widgetFamily: 'systemLarge',
  widgetContentMargins: { top: 16, bottom: 16, leading: 16, trailing: 16 } };
for (const weekStart of ['sunday', 'monday']) check(`large calendar renders all 42 linked dates (${weekStart})`, () => {
  const tree = layouts.CalendarWidget(propsFor(new Date(2026, 7, 1), weekStart), env);
  validate(tree);
  const links = nodes(tree).filter((node) => node.type === 'LinkView' && node.props.destination.startsWith('/day'));
  const dateCellLinks = links.filter((link) => nodes(link).some((node) =>
    node.props?.modifiers?.some((modifier) => modifier.name === 'frame' && modifier.args[0].height === 42),
  ));
  assert.equal(dateCellLinks.length, 42);
  assert(dateCellLinks.every((link) => nodes(link).some((node) =>
    node.props?.modifiers?.some((modifier) => modifier.name === 'contentShape' && modifier.args[0].type === 'rectangle'),
  )), 'each date link should use its full rectangular cell as the hit target');
  assert(links.some((node) => node.props.destination.endsWith('2026-08-31')));
  assert(nodes(tree).some((node) => node.props.children === '2026년 8월'));
  assert(nodes(tree).some((node) => node.props.modifiers?.some((modifier) => modifier.name === 'containerRelativeFrame')));
  const header = nodes(tree).find((node) => node.type === 'HStackView' &&
    nodes(node).some((child) => child.props?.children === '2026년 8월'));
  assert.equal(header.props.modifiers.find((modifier) => modifier.name === 'padding').args[0].horizontal, 10);
  for (const target of ['calendar.previous-month', 'calendar.today', 'calendar.next-month']) {
    const control = nodes(tree).find((node) => node.type === 'Button' && node.props.target === target);
    assert(control.props.modifiers.some((modifier) => modifier.name === 'frame' && modifier.args[0].height === 28));
    assert(control.props.modifiers.some((modifier) => modifier.name === 'background' && modifier.args[0] === colors.accentSoft));
    assert(control.props.modifiers.some((modifier) => modifier.name === 'cornerRadius' && modifier.args[0] === 14));
  }
  const quickAdd = nodes(tree).find((node) => node.type === 'LinkView' && node.props.destination === '/quick-event');
  const quickAddIcon = nodes(quickAdd).find((node) => node.type === 'ImageView' && node.props.systemName === 'plus');
  assert.equal(quickAddIcon.props.color, colors.onAccent);
  assert(quickAddIcon.props.modifiers.some((modifier) => modifier.name === 'frame' &&
    modifier.args[0].width === 28 && modifier.args[0].height === 28));
  assert(quickAddIcon.props.modifiers.some((modifier) => modifier.name === 'background' && modifier.args[0] === colors.accent));
});
check('multi-day and overlapping events retain titles, links and column spans', () => {
  const props = propsFor(new Date(2026, 7, 1));
  const event = { key: 'trip', title: '여행', startColumn: 1, endColumn: 3, filled: true,
    colors: { light: 'label', dark: 'label' }, textColors: { light: 'ink', dark: 'ink' }, url: '/event/trip' };
  props.monthWeeks[0].lanes = [[event], [{ ...event, key: 'meeting', title: '회의', filled: false }], []];
  const tree = layouts.CalendarWidget(props, env);
  validate(tree);
  const title = nodes(tree).find((node) => node.props.children === '여행');
  assert.equal(title.props.modifiers.find((modifier) => modifier.name === 'containerRelativeFrame').args[0].span, 3);
  assert(nodes(tree).some((node) => node.props.children === '회의'));
});
check('hidden event count links to the complete day view', () => {
  const props = propsFor(new Date(2026, 7, 1));
  const day = props.monthWeeks[0].days[1];
  day.hiddenEventCount = 3;
  const tree = layouts.CalendarWidget(props, env);
  validate(tree);
  const overflow = nodes(tree).find((node) => node.type === 'LinkView' &&
    node.props.destination === day.url && nodes(node).some((child) => child.props?.children === '+3'));
  assert.ok(overflow);
});
check('iOS 17 month controls move backward, forward and back to today without opening the app', () => {
  let props = propsFor(new Date(2026, 7, 1));
  let tree = layouts.CalendarWidget(props, env);
  props = { ...props, ...press(tree, 'calendar.previous-month') };
  tree = layouts.CalendarWidget(props, env);
  assert(nodes(tree).some((node) => node.props?.children === '2026년 7월'));
  assert(nodes(tree).some((node) => node.type === 'LinkView' && node.props.destination.endsWith('2026-07-15')));

  props = { ...props, ...press(tree, 'calendar.next-month') };
  tree = layouts.CalendarWidget(props, env);
  assert(nodes(tree).some((node) => node.props?.children === '2026년 8월'));

  props = { ...props, ...press(tree, 'calendar.next-month') };
  tree = layouts.CalendarWidget(props, env);
  assert(nodes(tree).some((node) => node.props?.children === '2026년 9월'));

  props = { ...props, ...press(tree, 'calendar.today') };
  tree = layouts.CalendarWidget(props, env);
  assert(nodes(tree).some((node) => node.props?.children === '2026년 8월'));
});
check('all families and the iOS 16 fallback serialize only supported native views', () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge', 'systemExtraLarge', 'accessoryInline', 'accessoryCircular', 'accessoryRectangular']) {
    for (const name of Object.keys(layouts)) {
      const tree = layouts[name](propsFor(new Date(2026, 7, 1)), {
      ...env, widgetFamily: family, widgetContentMargins: undefined, colorScheme: 'dark',
      });
      validate(tree);
      if (name === 'CalendarWidget' && (family === 'systemLarge' || family === 'systemExtraLarge')) {
        assert.equal(nodes(tree).filter((node) => node.type === 'Button').length, 0);
      }
    }
  }
});
check('missing and expired large payloads show a calendar and refresh guidance, not a stale event list', () => {
  for (const props of [{}, { ...propsFor(new Date(2026, 7, 1)), expired: true }]) {
    const tree = layouts.CalendarWidget(props, env);
    validate(tree);
    const text = nodes(tree).filter((node) => node.type === 'TextView');
    assert.equal(text.length, 51);
    assert(text.some((node) => node.props.children === '앱을 열어 일정을 불러오세요'));
  }
});
check('a pre-month-grid payload is rejected and replaced by the 42-cell calendar fallback', () => {
  const legacy = propsFor(new Date(2026, 7, 1));
  delete legacy.layoutRevision;
  legacy.viewName = '앱과 같은 캘린더';
  legacy.events = [{
    id: 'legacy', title: '예전 일정 목록', timeLabel: '오전 7:00', calendarName: '예전',
    colors: { light: 'label', dark: 'label' }, url: '/event/legacy', sortAt: 1, endAt: 2,
  }];
  const tree = layouts.CalendarWidget(legacy, env);
  validate(tree);
  const text = nodes(tree).filter((node) => node.type === 'TextView');
  assert.equal(text.length, 51);
  assert(!text.some((node) => node.props.children === legacy.viewName));
  assert(!text.some((node) => node.props.children === legacy.events[0].title));
});
console.log(`\nWidget regressions: ${passed} passed`);
