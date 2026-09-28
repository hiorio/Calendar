/** Exercise the real wallpaper snapshot builder with isolated theme/native adapters. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

register('./ts-resolve.mjs', pathToFileURL('./scripts/'));
const dateUtils = await import('../src/lib/date.ts');
const eventTime = await import('../src/lib/event-time.ts');
const colors = await import('../src/features/calendars/colors.ts');

const palette = {
  background: '#111111',
  surface: '#222222',
  surfaceMuted: '#333333',
  text: '#ffffff',
  textSecondary: '#dddddd',
  textTertiary: '#aaaaaa',
  accent: '#ee7700',
  accentSoft: '#442200',
  onAccent: '#ffffff',
  sunday: '#ff5555',
  saturday: '#5588ff',
};
const lightPalette = {
  ...palette,
  background: '#faf8f5',
  surface: '#ffffff',
  text: '#241c18',
};
const mocks = {
  '@/constants/theme': { ThemePalettes: { apricot: { dark: palette, light: lightPalette } } },
  '@/features/calendars/colors': colors,
  '@/lib/date': dateUtils,
  '@/lib/event-time': eventTime,
  './constants': { LOCK_SCREEN_BACKGROUND_FILE: 'TimeFlowerWallpaperBackground.image' },
};
const code = ts.transpileModule(readFileSync('src/features/wallpaper/snapshot.ts', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: false,
  },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(
  (name) => {
    assert.ok(name in mocks, `Missing ${name}`);
    return mocks[name];
  },
  module,
  module.exports,
);
const { buildLockScreenBoardSnapshot } = module.exports;

let passed = 0;
function check(name, run) {
  run();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

function allDay(id, calendarId, startDate = '2026-09-24', endDate = startDate) {
  return {
    id,
    key: id,
    calendar_id: calendarId,
    title: id,
    calendarName: calendarId,
    displayColor: '#E2673F',
    color: null,
    is_all_day: true,
    start_date: startDate,
    end_date: endDate,
    start_at: null,
    end_at: null,
    timezone: 'Asia/Seoul',
    originalStart: `${startDate}T00:00:00.000Z`,
  };
}

const many = Array.from({ length: 13 }, (_, index) => allDay(`event-${index}`, 'allowed'));
many[0].title = '가'.repeat(140);
const duplicateFirst = allDay('duplicate', 'allowed', '2026-09-26');
const duplicateLast = { ...duplicateFirst, title: 'deduplicated' };
const multi = allDay('multi', 'allowed', '2026-09-23', '2026-09-25');
const hidden = allDay('hidden-event', 'hidden');
const connectedHoliday = {
  kind: 'device', id: 'holiday', key: 'device:holiday:2026-09-24',
  title: '명절', calendarId: 'holiday-calendar', calendarName: '대한민국 공휴일',
  displayColor: '#E2673F', is_all_day: true, start_date: '2026-09-24', end_date: '2026-09-24',
  start_at: null, end_at: null, timezone: 'Asia/Seoul',
};
const memos = [
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `memo-${index}`,
    calendar_id: 'allowed',
    content: `memo ${index}`,
    done: false,
    calendarName: '선택',
    calendarColor: '#4A57C8',
  })),
  {
    id: 'done', calendar_id: 'allowed', content: 'done', done: true,
    calendarName: '선택', calendarColor: '#4A57C8',
  },
  {
    id: 'hidden-memo', calendar_id: 'hidden', content: 'hidden', done: false,
    calendarName: '숨김', calendarColor: '#4A57C8',
  },
];
memos[0].content = '메'.repeat(240);

function build(overrides = {}) {
  return buildLockScreenBoardSnapshot({
    now: new Date('2026-09-24T09:00:00+09:00'),
    expiresAt: new Date('2026-10-01T00:00:00+09:00'),
    dataStart: new Date(2026, 8, 1),
    dataEnd: new Date(2026, 9, 1),
    screen: { width: 200, height: 400, scale: 8 },
    layout: 'agenda',
    weekStart: 'monday',
    showMemos: true,
    backgroundMode: 'photo',
    theme: 'apricot',
    mode: 'custom',
    visibleCalendarIds: new Set(['allowed']),
    events: [...many, duplicateFirst, duplicateLast, multi, hidden],
    memos,
    ...overrides,
  });
}

check('visible data is filtered, deduplicated and expanded across each event day', () => {
  const snapshot = build();
  assert(!JSON.stringify(snapshot).includes('hidden-event'));
  assert(!JSON.stringify(snapshot).includes('hidden-memo'));
  assert.equal(snapshot.days.flatMap((day) => day.events).filter((event) => event.key === 'duplicate').length, 1);
  assert.deepEqual(
    snapshot.days.filter((day) => day.events.some((event) => event.key === 'multi')).map((day) => day.key),
    ['2026-09-23', '2026-09-24', '2026-09-25'],
  );
});

check('daily payload is capped while its total count remains accurate', () => {
  const day = build().days.find((item) => item.key === '2026-09-24');
  assert.equal(day.eventCount, 14);
  assert.equal(day.events.length, 12);
});

check('monthly board keeps today events for the card below the calendar', () => {
  const snapshot = build({ layout: 'month' });
  assert.equal(snapshot.layout, 'month');
  assert.equal(snapshot.days.find((day) => day.key === '2026-09-24')?.eventCount, 14);
});

check('selected connected device holidays appear without exposing unselected calendars', () => {
  const snapshot = build({
    events: [],
    visibleDeviceCalendarIds: new Set(['holiday-calendar']),
    deviceEvents: [connectedHoliday, { ...connectedHoliday, key: 'device:hidden', calendarId: 'hidden-device' }],
  });
  const today = snapshot.days.find((item) => item.key === '2026-09-24');
  assert.equal(today.eventCount, 1);
  assert.equal(today.events.filter((item) => item.title === '명절').length, 1);
  assert(!JSON.stringify(snapshot).includes('device:hidden'));
  assert(!JSON.stringify(build({ deviceEvents: [connectedHoliday] })).includes('명절'));
});

check('unfinished visible memos are capped and can be disabled', () => {
  const snapshot = build();
  assert.equal(snapshot.memos.length, 8);
  assert.equal(Array.from(snapshot.memos[0].content).length, 200);
  assert.equal(
    Array.from(snapshot.days.flatMap((day) => day.events).find((event) => event.key === 'event-0').title).length,
    120,
  );
  assert.deepEqual(build({ showMemos: false }).memos, []);
});

check('cleared privacy snapshots never retain schedule content', () => {
  const snapshot = build({ cleared: true });
  assert.equal(snapshot.cleared, true);
  assert.deepEqual(snapshot.days, []);
  assert.deepEqual(snapshot.memos, []);
});

check('photo file, screen bounds, timestamps and theme palette are stable', () => {
  const snapshot = build();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.backgroundFile, 'TimeFlowerWallpaperBackground.image');
  assert.deepEqual(snapshot.screen, { width: 320, height: 568, scale: 4 });
  assert.equal(snapshot.dataStart, '2026-09-01');
  assert.equal(snapshot.dataEnd, '2026-10-01');
  assert(Number.isFinite(Date.parse(snapshot.generatedAt)));
  assert(Number.isFinite(Date.parse(snapshot.expiresAt)));
  assert.equal(snapshot.palette.background, palette.background);
  assert.equal(build({ backgroundMode: 'theme' }).backgroundFile, undefined);
});

check('light board uses the light palette and keeps photos on the dark palette', () => {
  const light = build({ backgroundMode: 'light' });
  assert.equal(light.backgroundFile, undefined);
  assert.equal(light.palette.background, lightPalette.background);
  assert.equal(light.palette.text, lightPalette.text);
  assert.equal(build({ backgroundMode: 'photo' }).palette.background, palette.background);
});

function storageFor(widgetsDirectory) {
  const files = new Map([['photo://chosen', 'image-bytes']]);
  class MockFile {
    constructor(root, name) {
      this.uri = name ? `${root}/${name}` : String(root);
    }
    get exists() { return files.has(this.uri); }
    create() { files.set(this.uri, ''); }
    write(value) { files.set(this.uri, value); }
    async copy(destination) { files.set(destination.uri, files.get(this.uri) ?? ''); }
    moveSync(destination) {
      files.set(destination.uri, files.get(this.uri) ?? '');
      files.delete(this.uri);
      this.uri = destination.uri;
    }
    delete() { files.delete(this.uri); }
  }
  const storageMocks = {
    'expo-file-system': { File: MockFile },
    'expo-widgets': { widgetsDirectory },
    './constants': {
      LOCK_SCREEN_BACKGROUND_FILE: 'TimeFlowerWallpaperBackground.image',
      LOCK_SCREEN_OUTPUT_FILE: 'TimeFlowerWallpaper.png',
      LOCK_SCREEN_SNAPSHOT_FILE: 'TimeFlowerWallpaperSnapshot.json',
      LOCK_SCREEN_SNAPSHOT_TEMP_FILE: 'TimeFlowerWallpaperSnapshot.tmp',
    },
  };
  const storageCode = ts.transpileModule(readFileSync('src/features/wallpaper/storage.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: false,
    },
  }).outputText;
  const storageModule = { exports: {} };
  new Function('require', 'module', 'exports', storageCode)(
    (name) => {
      assert.ok(name in storageMocks, `Missing ${name}`);
      return storageMocks[name];
    },
    storageModule,
    storageModule.exports,
  );
  return { api: storageModule.exports, files };
}

{
  const { api, files } = storageFor('/group/ExpoWidgets');
  check('snapshot and selected photo use fixed App Group filenames', () => {
    assert.equal(api.publishLockScreenBoardSnapshot({ version: 1 }), true);
    assert.deepEqual(
      JSON.parse(files.get('/group/ExpoWidgets/TimeFlowerWallpaperSnapshot.json')),
      { version: 1 },
    );
    assert.equal(files.has('/group/ExpoWidgets/TimeFlowerWallpaperSnapshot.tmp'), false);
  });
  await api.storeLockScreenBackground('photo://chosen');
  check('photo copy and removal are local and idempotent', () => {
    assert.equal(
      files.get('/group/ExpoWidgets/TimeFlowerWallpaperBackground.image'),
      'image-bytes',
    );
    api.removeLockScreenBackground();
    api.removeLockScreenBackground();
    assert.equal(files.has('/group/ExpoWidgets/TimeFlowerWallpaperBackground.image'), false);
    files.set('/group/ExpoWidgets/TimeFlowerWallpaper.png', 'private-image');
    api.removeLockScreenBoardOutput();
    assert.equal(files.has('/group/ExpoWidgets/TimeFlowerWallpaper.png'), false);
  });
}

{
  const { api } = storageFor(null);
  check('missing App Group refuses publication instead of writing elsewhere', () => {
    assert.equal(api.publishLockScreenBoardSnapshot({ version: 1 }), false);
  });
  await assert.rejects(
    api.storeLockScreenBackground('photo://chosen'),
    /잠금화면 보드를 사용할 수 없습니다/,
  );
  passed += 1;
  console.log('  PASS  missing App Group reports a user-facing photo storage error');
}

console.log(`\nWallpaper regressions: ${passed} passed`);
