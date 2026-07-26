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
const { eventDayKeys, switchAllDay, moveStart, moveEnd } = await import('../src/lib/event-time.ts');
const { objectParticle, subjectParticle } = await import('../src/lib/korean.ts');

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
