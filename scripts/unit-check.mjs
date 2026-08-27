/**
 * 순수 함수 검사.
 *
 *   npm run test:unit
 *
 * 반복 전개와 타임존 변환은 DB도 화면도 거치지 않는 계산이라, 스모크 테스트로는
 * 잘 드러나지 않는다. 특히 서머타임 경계는 브라우저로 확인하기 어렵다.
 * 여기서는 앱을 띄우지 않고 모듈만 직접 부른다.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolve.mjs', pathToFileURL('./scripts/'));

const { toWallClock, fromWallClock } = await import('../src/lib/timezone.ts');
const { buildRrule, parseRrule, expandEvent, computeRruleUntil, truncateRruleBefore, applyExceptions } =
  await import('../src/lib/recurrence.ts');
const {
  deviceAllDayDateRange,
  eventDayKeys,
  switchAllDay,
  moveStart,
  moveEnd,
  newEventTime,
  quickEventTime,
} = await import('../src/lib/event-time.ts');
const { objectParticle, subjectParticle } = await import('../src/lib/korean.ts');
const { CALENDAR_COLORS, DEFAULT_CALENDAR_COLOR, calendarColorForScheme, onColor } =
  await import('../src/features/calendars/colors.ts');
const { notificationRoute } = await import('../src/features/notifications/routes.ts');
const { buildMonthMatrix, isoWeekNumber, weekdayLabels } = await import('../src/lib/date.ts');
const { layoutWeekMarks } = await import('../src/features/calendar/month-layout.ts');
const { homeMonthSnapshotKey, parseHomeSnapshotCache, upsertHomeMonthSnapshot } =
  await import('../src/features/calendar/home-snapshot-cache.ts');
const { buildPushMessage, chunks, retryDelaySeconds, expoErrorCode } =
  await import('../supabase/functions/_shared/push.ts');
const { parseOAuthCallback } = await import('../src/features/auth/oauth-callback.ts');
const { parseSocialProviderAvailability } =
  await import('../src/features/auth/provider-settings-parser.ts');
const { applyTimePickerParts, exactMinuteOptions, timePickerParts } =
  await import('../src/features/experiments/time-picker-lab-model.ts');

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `기대 ${e}\n        실제 ${a}`);
}

// ---------------------------------------------------------------------------
console.log('0. 캘린더 표시 계산');
{
  const august = new Date(2026, 7, 1);
  eq(
    '일요일 시작 격자는 앞선 일요일부터',
    buildMonthMatrix(august, 'sunday')[0].map((d) => d.getDay()),
    [0, 1, 2, 3, 4, 5, 6],
  );
  eq(
    '월요일 시작 격자는 월요일부터',
    buildMonthMatrix(august, 'monday')[0].map((d) => d.getDay()),
    [1, 2, 3, 4, 5, 6, 0],
  );
  eq('월요일 시작 요일 라벨', weekdayLabels('monday'), ['월', '화', '수', '목', '금', '토', '일']);
  check('2026년 첫 목요일은 ISO 1주', isoWeekNumber(new Date(2026, 0, 1)) === 1);
}

{
  const mark = { id: 'trip', title: '여름 휴가', color: '#1B54A8', isAllDay: false };
  const marksByDate = {
    '2026-08-26': [mark],
    '2026-08-27': [mark],
    '2026-08-28': [mark],
    '2026-08-29': [mark],
    '2026-08-30': [mark],
  };
  const week = ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'];
  const [segment] = layoutWeekMarks(week, marksByDate);

  eq('기간 일정은 한 주에서 하나의 구간으로 합친다',
    [segment.startColumn, segment.endColumn, segment.isSpanning], [3, 6, true]);
  check('다음 주로 이어지는 기간 일정은 오른쪽 연결 상태다', segment.continuesAfter);

  const nextWeek = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
  const [continued] = layoutWeekMarks(nextWeek, marksByDate);
  check('이전 주에서 이어진 구간은 왼쪽 연결 상태다', continued.continuesBefore);
}

{
  const first = { id: 'first', isAllDay: true };
  const second = { id: 'second', isAllDay: true };
  const placements = layoutWeekMarks(
    ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'],
    {
      '2026-08-24': [first],
      '2026-08-25': [first, second],
      '2026-08-26': [first, second],
    },
  );
  check('겹치는 기간 일정은 서로 다른 행을 쓴다', placements[0].lane !== placements[1].lane);
}

{
  const augustKey = homeMonthSnapshotKey(new Date(2026, 7, 1), 'sunday');
  eq('홈 스냅샷 키는 월과 주 시작 설정을 구분한다', augustKey, '2026-08:sunday');

  const augustSnapshot = {
    key: augustKey,
    savedAt: '2026-08-19T00:00:00.000Z',
    marksByDate: {
      '2026-08-19': [{ id: 'event-1', title: '저녁 약속', color: '#1B54A8', isAllDay: false }],
    },
    stickersByDate: {},
  };
  const firstCache = upsertHomeMonthSnapshot(null, 'user-a', augustSnapshot);
  eq('홈 스냅샷은 현재 사용자와 함께 저장한다',
    [firstCache.userId, firstCache.months[0].key], ['user-a', augustKey]);
  check('직렬화한 홈 스냅샷을 다시 읽는다',
    parseHomeSnapshotCache(JSON.stringify(firstCache))?.months[0].marksByDate['2026-08-19'][0].title === '저녁 약속');

  const otherUserCache = upsertHomeMonthSnapshot(firstCache, 'user-b', {
    ...augustSnapshot,
    key: '2026-09:sunday',
  });
  eq('사용자가 바뀌면 이전 사용자의 월 스냅샷을 이어받지 않는다',
    [otherUserCache.userId, otherUserCache.months.map((month) => month.key)],
    ['user-b', ['2026-09:sunday']]);
  check('손상된 홈 스냅샷은 사용하지 않는다', parseHomeSnapshotCache('{broken') === null);
}

{
  const now = new Date(2026, 7, 15, 14, 12, 47, 381);
  const initial = newEventTime(new Date(2026, 8, 3), now);
  eq(
    '새 일정은 선택한 날짜와 현재 시각으로 시작',
    [
      initial.start.getFullYear(),
      initial.start.getMonth(),
      initial.start.getDate(),
      initial.start.getHours(),
      initial.start.getMinutes(),
      initial.start.getSeconds(),
      initial.start.getMilliseconds(),
    ],
    [2026, 8, 3, 14, 12, 0, 0],
  );
  check('새 일정 기본 길이는 한 시간', initial.end - initial.start === 60 * 60 * 1000);

  const late = newEventTime(new Date(2026, 8, 3), new Date(2026, 7, 15, 23, 45));
  eq(
    '늦은 시각의 새 일정 종료는 다음 날로 넘어간다',
    [late.end.getMonth(), late.end.getDate(), late.end.getHours(), late.end.getMinutes()],
    [8, 4, 0, 45],
  );
}

{
  const source = new Date(2026, 8, 3, 23, 37, 42, 123);
  eq('실험 피커는 시각을 다이얼 값으로 나눈다', timePickerParts(source), {
    meridiem: 'pm',
    hour12: 11,
    coarseMinute: 30,
    minute: 37,
  });
  eq('30분 선택 뒤에는 30~39분을 연다', exactMinuteOptions(30), [
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  ]);
  const midnight = applyTimePickerParts(source, {
    meridiem: 'am',
    hour12: 12,
    coarseMinute: 0,
    minute: 5,
  });
  eq(
    '오전 12시는 자정으로 적용하고 초는 버린다',
    [midnight.getHours(), midnight.getMinutes(), midnight.getSeconds(), midnight.getMilliseconds()],
    [0, 5, 0, 0],
  );
}

{
  const now = new Date(2026, 7, 15, 14, 12);
  const today = quickEventTime(new Date(2026, 7, 15), now);
  check(
    '빠른 일정은 오늘의 다음 30분 경계에서 시작',
    today.start.getHours() === 14 && today.start.getMinutes() === 30,
    today.start.toString(),
  );
  check('빠른 일정 기본 길이는 한 시간', today.end - today.start === 60 * 60 * 1000);

  const anotherDay = quickEventTime(new Date(2026, 7, 20), now);
  check(
    '다른 날의 빠른 일정은 오전 9시 시작',
    anotherDay.start.getHours() === 9 && anotherDay.start.getMinutes() === 0,
    anotherDay.start.toString(),
  );
}

// ---------------------------------------------------------------------------
console.log('1. 타임존 변환');
{
  const instant = new Date('2026-08-01T00:00:00Z');
  eq('UTC 자정은 서울에서 오전 9시', toWallClock(instant, 'Asia/Seoul'), {
    year: 2026, month: 8, day: 1, hour: 9, minute: 0,
  });

  const back = fromWallClock({ year: 2026, month: 8, day: 1, hour: 9, minute: 0 }, 'Asia/Seoul');
  check('벽시계 → 순간이 되돌아온다', back.toISOString() === '2026-08-01T00:00:00.000Z', back.toISOString());

  // 서울은 서머타임이 없다. 뉴욕으로 경계를 확인한다.
  // 2026-03-08 02:00 EST → 03:00 EDT (한 시간이 사라진다)
  const beforeDst = fromWallClock({ year: 2026, month: 3, day: 8, hour: 1, minute: 30 }, 'America/New_York');
  const afterDst = fromWallClock({ year: 2026, month: 3, day: 8, hour: 3, minute: 30 }, 'America/New_York');
  check('서머타임 전후 오프셋이 다르다', afterDst.getTime() - beforeDst.getTime() === 60 * 60 * 1000,
    `차이 ${(afterDst - beforeDst) / 60000}분 (1:30 EST → 3:30 EDT는 실제로 1시간)`);

  eq('여름의 뉴욕은 UTC-4', toWallClock(new Date('2026-07-01T16:00:00Z'), 'America/New_York'), {
    year: 2026, month: 7, day: 1, hour: 12, minute: 0,
  });
  eq('겨울의 뉴욕은 UTC-5', toWallClock(new Date('2026-01-01T17:00:00Z'), 'America/New_York'), {
    year: 2026, month: 1, day: 1, hour: 12, minute: 0,
  });
}

// ---------------------------------------------------------------------------
console.log('\n2. 반복 규칙 왕복');
{
  const rrule = buildRrule({ freq: 'WEEKLY', until: null });
  check('매주 규칙이 만들어진다', rrule === 'FREQ=WEEKLY', rrule);
  eq('읽으면 그대로 돌아온다', parseRrule(rrule), { freq: 'WEEKLY', until: null });

  const withUntil = buildRrule({ freq: 'DAILY', until: new Date(2026, 7, 10) });
  const parsed = parseRrule(withUntil);
  check('종료일이 날짜 그대로 보존된다',
    parsed.freq === 'DAILY' && parsed.until?.getFullYear() === 2026 &&
    parsed.until?.getMonth() === 7 && parsed.until?.getDate() === 10,
    `${withUntil} → ${parsed.until}`);

  eq('반복 없음은 null', buildRrule({ freq: null, until: null }), null);
  eq('읽을 수 없는 규칙은 반복 없음으로 본다', parseRrule('이건 규칙이 아니다'), { freq: null, until: null });
}

// ---------------------------------------------------------------------------
console.log('\n3. 회차 전개 (시간 지정)');
{
  const event = {
    id: 'e1',
    is_all_day: false,
    start_at: '2026-08-04T01:00:00.000Z', // 서울 8/4(화) 10:00
    end_at: '2026-08-04T02:00:00.000Z',
    start_date: null,
    end_date: null,
    timezone: 'Asia/Seoul',
    rrule: 'FREQ=WEEKLY',
  };

  const occurrences = expandEvent(event, new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
  const starts = occurrences.map((o) => o.start_at);

  eq('8월의 화요일마다 잡힌다', starts, [
    '2026-08-04T01:00:00.000Z',
    '2026-08-11T01:00:00.000Z',
    '2026-08-18T01:00:00.000Z',
    '2026-08-25T01:00:00.000Z',
  ]);
  check('회차 길이가 유지된다',
    occurrences.every((o) => new Date(o.end_at) - new Date(o.start_at) === 3600_000));
}

{
  // 벽시계 기준 전개의 핵심: 서머타임을 넘어도 현지 시각이 그대로여야 한다.
  const event = {
    id: 'e2',
    is_all_day: false,
    start_at: '2026-02-24T14:00:00.000Z', // 뉴욕 2/24(화) 09:00 EST
    end_at: '2026-02-24T15:00:00.000Z',
    start_date: null,
    end_date: null,
    timezone: 'America/New_York',
    rrule: 'FREQ=WEEKLY',
  };

  const occurrences = expandEvent(event, new Date('2026-02-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'));
  const localHours = occurrences.map((o) => toWallClock(new Date(o.start_at), 'America/New_York').hour);

  check('서머타임을 넘어도 현지 9시를 유지한다', localHours.every((h) => h === 9), JSON.stringify(localHours));
  check('서머타임 이후 회차는 UTC로는 한 시간 당겨진다',
    occurrences.some((o) => o.start_at.endsWith('13:00:00.000Z')) &&
    occurrences.some((o) => o.start_at.endsWith('14:00:00.000Z')),
    JSON.stringify(occurrences.map((o) => o.start_at)));
}

// ---------------------------------------------------------------------------
console.log('\n4. 회차 전개 (종일)');
{
  const event = {
    id: 'e3',
    is_all_day: true,
    start_at: null,
    end_at: null,
    start_date: '2026-08-03',
    end_date: '2026-08-03',
    timezone: 'Asia/Seoul',
    rrule: 'FREQ=MONTHLY',
  };

  const occurrences = expandEvent(event, new Date('2026-08-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
  eq('매월 3일에 잡힌다', occurrences.map((o) => o.start_date), ['2026-08-03', '2026-09-03', '2026-10-03']);
  check('종일 회차에는 시각 컬럼이 없다', occurrences.every((o) => o.start_at === null && o.end_at === null));
}

{
  const event = {
    id: 'e4',
    is_all_day: true,
    start_at: null,
    end_at: null,
    start_date: '2026-08-14',
    end_date: '2026-08-16',
    timezone: 'Asia/Seoul',
    rrule: null,
  };
  eq('사흘짜리 종일은 사흘에 걸린다', eventDayKeys(event), ['2026-08-14', '2026-08-15', '2026-08-16']);
}

{
  // 22:00~24:00 짜리가 다음 날까지 번지면 안 된다
  const start = new Date(2026, 7, 5, 22, 0);
  const end = new Date(2026, 7, 6, 0, 0);
  eq('자정에 끝나는 일정은 다음 날을 칠하지 않는다',
    eventDayKeys({ is_all_day: false, start_at: start.toISOString(), end_at: end.toISOString(), start_date: null, end_date: null, timezone: 'Asia/Seoul' }),
    ['2026-08-05']);

  const overnight = new Date(2026, 7, 5, 22, 0);
  const nextMorning = new Date(2026, 7, 6, 2, 0);
  eq('자정을 넘기면 이틀에 걸린다',
    eventDayKeys({ is_all_day: false, start_at: overnight.toISOString(), end_at: nextMorning.toISOString(), start_date: null, end_date: null, timezone: 'Asia/Seoul' }),
    ['2026-08-05', '2026-08-06']);
}

{
  // 날짜를 하루씩 더할 때 자정을 기준으로 잡으면, 서머타임 때문에 자정이 존재하지
  // 않는 날에 같은 날짜로 되돌아온다. 그러면 같은 키가 두 번 나온다.
  // (전개 자체는 events.timezone 기준이지만, 격자에 칠하는 날짜는 기기 로컬 기준이다.)
  const keys = eventDayKeys({
    is_all_day: true, start_at: null, end_at: null,
    start_date: '2026-09-05', end_date: '2026-09-09', timezone: 'America/Santiago',
  });
  eq('닷새짜리 종일은 닷새', keys, ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']);
  check('날짜 키에 중복이 없다', keys.length === new Set(keys).size, JSON.stringify(keys));
}

{
  eq(
    'iOS UTC 직렬화 종일 일정은 기기 날짜로 복원한다',
    deviceAllDayDateRange(
      '2026-08-20T15:00:00.000Z',
      '2026-08-21T15:00:00.000Z',
      'Asia/Seoul',
    ),
    { startDate: '2026-08-21', endDate: '2026-08-21' },
  );
  eq(
    '여러 날인 iOS 종일 일정도 포함 종료일을 보존한다',
    deviceAllDayDateRange(
      '2026-08-20T15:00:00.000Z',
      '2026-08-23T15:00:00.000Z',
      'Asia/Seoul',
    ),
    { startDate: '2026-08-21', endDate: '2026-08-23' },
  );
  eq(
    '날짜만 넘어오면 타임존 변환 없이 유지한다',
    deviceAllDayDateRange('2026-08-21', '2026-08-22', 'America/Los_Angeles'),
    { startDate: '2026-08-21', endDate: '2026-08-21' },
  );
}

// ---------------------------------------------------------------------------
console.log('\n5. rrule_until (기간 조회가 이 값으로 걸러진다)');
{
  eq('끝이 없으면 null', computeRruleUntil({
    is_all_day: false, start_at: '2026-08-04T01:00:00.000Z', end_at: '2026-08-04T02:00:00.000Z',
    start_date: null, end_date: null, timezone: 'Asia/Seoul', rrule: 'FREQ=WEEKLY',
  }), null);

  const until = computeRruleUntil({
    is_all_day: false, start_at: '2026-08-04T01:00:00.000Z', end_at: '2026-08-04T02:00:00.000Z',
    start_date: null, end_date: null, timezone: 'Asia/Seoul',
    rrule: buildRrule({ freq: 'WEEKLY', until: new Date(2026, 7, 20) }),
  });
  // 8/20까지면 마지막 화요일은 8/18, 종료는 그날 11:00 KST = 02:00Z
  check('마지막 회차의 종료 시각이 나온다', until === '2026-08-18T02:00:00.000Z', until);

  const allDayUntil = computeRruleUntil({
    is_all_day: true, start_at: null, end_at: null,
    start_date: '2026-08-03', end_date: '2026-08-03', timezone: 'Asia/Seoul',
    rrule: buildRrule({ freq: 'MONTHLY', until: new Date(2026, 9, 31) }),
  });
  // 마지막 회차 10/3, 종일의 끝은 다음 자정 10/4 00:00 KST = 10/3 15:00Z
  check('종일 반복은 마지막 날 다음 자정', allDayUntil === '2026-10-03T15:00:00.000Z', allDayUntil);
}

// ---------------------------------------------------------------------------
console.log('\n6. 이후 모두 삭제 / 회차 예외');
{
  const truncated = truncateRruleBefore('FREQ=WEEKLY', new Date('2026-08-18T01:00:00.000Z'), 'Asia/Seoul');
  const event = {
    id: 'e5', is_all_day: false,
    start_at: '2026-08-04T01:00:00.000Z', end_at: '2026-08-04T02:00:00.000Z',
    start_date: null, end_date: null, timezone: 'Asia/Seoul', rrule: truncated,
  };
  const starts = expandEvent(event, new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))
    .map((o) => o.start_at);
  eq('자른 회차부터는 사라진다', starts, ['2026-08-04T01:00:00.000Z', '2026-08-11T01:00:00.000Z']);
}

{
  const occurrences = [
    { id: 'e6', title: '주간 회의', description: null, location: null, originalStart: '2026-08-04T01:00:00.000Z', start_at: '2026-08-04T01:00:00.000Z', end_at: '2026-08-04T02:00:00.000Z', start_date: null, end_date: null, is_all_day: false, timezone: 'Asia/Seoul' },
    { id: 'e6', title: '주간 회의', description: null, location: null, originalStart: '2026-08-11T01:00:00.000Z', start_at: '2026-08-11T01:00:00.000Z', end_at: '2026-08-11T02:00:00.000Z', start_date: null, end_date: null, is_all_day: false, timezone: 'Asia/Seoul' },
    { id: 'e6', title: '주간 회의', description: null, location: null, originalStart: '2026-08-18T01:00:00.000Z', start_at: '2026-08-18T01:00:00.000Z', end_at: '2026-08-18T02:00:00.000Z', start_date: null, end_date: null, is_all_day: false, timezone: 'Asia/Seoul' },
  ];

  const result = applyExceptions(occurrences, [
    { event_id: 'e6', original_start: '2026-08-11T01:00:00.000Z', type: 'CANCELLED', title: null, description: null, location: null, start_at: null, end_at: null, start_date: null, end_date: null },
    { event_id: 'e6', original_start: '2026-08-18T01:00:00.000Z', type: 'MODIFIED', title: '주간 회의 (장소 변경)', description: null, location: '3층', start_at: null, end_at: null, start_date: null, end_date: null },
  ]);

  eq('취소한 회차는 빠지고 수정한 회차는 덮인다',
    result.map((o) => [o.originalStart, o.title, o.location]),
    [['2026-08-04T01:00:00.000Z', '주간 회의', null], ['2026-08-18T01:00:00.000Z', '주간 회의 (장소 변경)', '3층']]);

  // 표기가 달라도 같은 순간이면 같은 회차다
  const alt = applyExceptions(occurrences, [
    { event_id: 'e6', original_start: '2026-08-11T10:00:00+09:00', type: 'CANCELLED', title: null, description: null, location: null, start_at: null, end_at: null, start_date: null, end_date: null },
  ]);
  check('시각 표기가 달라도 같은 회차로 본다', alt.length === 2, JSON.stringify(alt.map((o) => o.originalStart)));
}

// ---------------------------------------------------------------------------
console.log('\n7. 폼 시간 보정');
{
  const timed = { isAllDay: false, start: new Date(2026, 7, 5, 9, 0), end: new Date(2026, 7, 5, 10, 0) };

  const moved = moveStart(timed, new Date(2026, 7, 5, 18, 30));
  check('시작을 옮기면 길이가 유지된다', moved.end.getHours() === 19 && moved.end.getMinutes() === 30,
    `${moved.end}`);

  const pushed = moveEnd(timed, new Date(2026, 7, 5, 8, 0));
  check('종료가 시작보다 앞서면 밀어 준다', pushed.end > pushed.start, `${pushed.end}`);

  const allDay = switchAllDay(timed, true);
  check('종일로 바꾸면 시각이 0시로 내려간다', allDay.isAllDay && allDay.start.getHours() === 0);

  const backToTimed = switchAllDay(allDay, false);
  check('시간 지정으로 되돌리면 종료가 시작보다 뒤다', backToTimed.end > backToTimed.start);
}

// ---------------------------------------------------------------------------
console.log('\n8. 한국어 조사');
{
  eq('받침 있으면 을', objectParticle('저녁 약속'), '저녁 약속을');
  eq('받침 없으면 를', objectParticle('이사'), '이사를');
  eq('받침 있으면 이', subjectParticle('민준'), '민준이');
  eq('받침 없으면 가', subjectParticle('앨리스'), '앨리스가');
  eq('숫자도 읽는 소리로 (1=일)', objectParticle('회의 1'), '회의 1을');
  eq('숫자도 읽는 소리로 (2=이)', objectParticle('회의 2'), '회의 2를');
  eq('영문도 읽는 소리로 (l=엘)', objectParticle('Excel'), 'Excel을');
  eq('영문도 읽는 소리로 (o=오)', objectParticle('Zoo'), 'Zoo를');
  eq('판단할 수 없으면 받침 없는 쪽', objectParticle('회의 🎉'), '회의 🎉를');
}

// ---------------------------------------------------------------------------
console.log('\n9. 캘린더 라벨 팔레트');
{
  const expected = [
    '#1B54A8',
    '#93B33A',
    '#A63363',
    '#4BB3C9',
    '#12705F',
    '#D8A72A',
    '#4F4EC4',
    '#EE8A45',
    '#7A3FAE',
    '#9AA1AC',
    '#C3402C',
    '#62B84E',
  ];

  eq('12색 순서가 고정돼 있다', CALENDAR_COLORS, expected);
  check('기본색은 첫 번째 슬롯이다', DEFAULT_CALENDAR_COLOR === expected[0]);
  check('중복 색이 없다', new Set(CALENDAR_COLORS).size === CALENDAR_COLORS.length);

  for (const scheme of ['light', 'dark']) {
    const ratios = CALENDAR_COLORS.map((color) =>
      contrastRatio(calendarColorForScheme(color, scheme), onColor(color, scheme)),
    );
    const minimum = Math.min(...ratios);
    check(
      `${scheme} 라벨 전부 WCAG AA 대비를 넘는다`,
      minimum >= 4.5,
      `최저 대비 ${minimum.toFixed(2)}`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log('\n10. 푸시 알림 발송');
{
  const eventId = '11111111-1111-4111-8111-111111111111';
  const calendarId = '22222222-2222-4222-8222-222222222222';
  const job = {
    id: 7,
    user_id: '33333333-3333-4333-8333-333333333333',
    type: 'COMMENT',
    attempts: 1,
    payload: {
      event_id: eventId,
      calendar_id: calendarId,
      calendar_name: '가족',
      title: '저녁 약속',
      excerpt: '조금 늦을 것 같아',
    },
  };
  const message = buildPushMessage(job, 'ExponentPushToken[test]');

  eq('댓글 알림 문구와 내부 이동 경로를 만든다', {
    title: message.title,
    body: message.body,
    url: message.data.url,
  }, {
    title: '저녁 약속에 새 댓글',
    body: '조금 늦을 것 같아',
    url: `/event/${eventId}`,
  });
  check('알림 payload의 event_id로 안전한 경로를 만든다',
    notificationRoute({ event_id: eventId }) === `/event/${eventId}`);
  check('외부 URL은 알림 이동 경로로 허용하지 않는다',
    notificationRoute({ url: 'https://evil.example/phishing' }) === null);
  eq('Expo 전송 제한에 맞춰 묶는다', chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  eq('재시도 지연은 지수 증가 후 5분에서 멈춘다',
    [1, 2, 3, 9].map(retryDelaySeconds), [15, 30, 60, 300]);
  check('DeviceNotRegistered 오류를 읽는다',
    expoErrorCode({ details: { error: 'DeviceNotRegistered' } }) === 'DeviceNotRegistered');
}

// ---------------------------------------------------------------------------
console.log('\n11. 소셜 로그인 callback 검증');
{
  const expected = 'timeline-development://auth-callback';

  eq(
    '등록한 callback의 인증 코드만 받는다',
    parseOAuthCallback(`${expected}?code=one-time-code`, expected),
    { ok: true, code: 'one-time-code' },
  );
  eq(
    '다른 callback 주소는 거부한다',
    parseOAuthCallback('timeline-development://wrong?code=stolen', expected),
    { ok: false, message: '로그인 응답 주소를 확인할 수 없습니다' },
  );
  eq(
    '공급자가 돌려준 오류를 사용자에게 전달한다',
    parseOAuthCallback(`${expected}?error=access_denied&error_description=Permission%20denied`, expected),
    { ok: false, message: 'Permission denied' },
  );
  eq(
    '인증 코드가 없는 성공 응답은 거부한다',
    parseOAuthCallback(expected, expected),
    { ok: false, message: '인증 코드를 받지 못했습니다' },
  );
  eq(
    '서버에서 활성화한 공급자만 사용할 수 있다고 읽는다',
    parseSocialProviderAvailability({ external: { google: true, apple: false } }),
    { google: true, apple: false },
  );
  eq(
    '형식이 잘못된 설정은 모두 비활성으로 본다',
    parseSocialProviderAvailability({ external: null }),
    { google: false, apple: false },
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
