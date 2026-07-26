/**
 * 반복 일정 (설계안 3장 · 4단계).
 *
 * 규칙은 iCalendar RRULE 문자열 그대로 `events.rrule`에 저장한다. 자체 표현을
 * 만들지 않는다 — 나중에 Google/Apple 캘린더를 가져올 때 그대로 받아야 한다.
 *
 * **전개는 벽시계 공간에서 한다.** "매주 화요일 9시"는 서머타임이 바뀌어도 9시다.
 * rrule에 tzid를 맡기려면 luxon이 필요하므로, 여기서는
 *   ① 시작 벽시계를 "UTC인 척하는" Date로 만들고
 *   ② rrule로 회차를 세고
 *   ③ 각 회차를 events.timezone의 벽시계로 읽어 실제 순간으로 되돌린다.
 */

import { RRule, type Options } from 'rrule';

import { toDateKey } from './date';
import { addMinutes, parseDateKey, type EventTimeColumns } from './event-time';
import {
  floatingToWallClock,
  fromWallClock,
  toWallClock,
  wallClockToFloating,
} from './timezone';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** 화면이 다루는 반복 설정. RRULE 전체를 노출하지 않는다. */
export type RecurrenceForm = {
  freq: Freq | null; // null이면 반복 없음
  /** 이 날까지(포함). null이면 계속 */
  until: Date | null;
};

const FREQ_MAP: Record<Freq, Options['freq']> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

export const FREQ_LABELS: Record<Freq, string> = {
  DAILY: '매일',
  WEEKLY: '매주',
  MONTHLY: '매월',
  YEARLY: '매년',
};

/**
 * 화면 설정 → RRULE 문자열.
 *
 * UNTIL은 벽시계 그대로 쓴다. 실제 순간으로 바꿔 넣으면 타임존이 다른 기기에서
 * 마지막 회차가 하루 어긋난다.
 */
export function buildRrule(recurrence: RecurrenceForm): string | null {
  if (!recurrence.freq) return null;

  const options: Partial<Options> = { freq: FREQ_MAP[recurrence.freq] };

  if (recurrence.until) {
    const wall = {
      year: recurrence.until.getFullYear(),
      month: recurrence.until.getMonth() + 1,
      day: recurrence.until.getDate(),
      hour: 23,
      minute: 59,
    };
    options.until = wallClockToFloating(wall);
  }

  // "RRULE:" 접두사는 빼고 규칙 본문만 저장한다
  return new RRule(options).toString().replace(/^RRULE:/, '');
}

export function parseRrule(rrule: string | null): RecurrenceForm {
  if (!rrule) return { freq: null, until: null };

  try {
    const rule = RRule.fromString(rrule);
    const freq = (Object.keys(FREQ_MAP) as Freq[]).find(
      (key) => FREQ_MAP[key] === rule.options.freq,
    );
    if (!freq) return { freq: null, until: null };

    const until = rule.options.until;
    return {
      freq,
      until: until
        ? (() => {
            const wall = floatingToWallClock(until);
            return new Date(wall.year, wall.month - 1, wall.day);
          })()
        : null,
    };
  } catch {
    // 우리가 만들지 않은 규칙(가져오기 등)은 반복 없음으로 보여 주고 건드리지 않는다
    return { freq: null, until: null };
  }
}

export function describeRecurrence(rrule: string | null): string | null {
  const { freq, until } = parseRrule(rrule);
  if (!freq) return null;

  const base = FREQ_LABELS[freq];
  if (!until) return `${base} 반복`;
  return `${base} 반복 · ${until.getFullYear()}. ${until.getMonth() + 1}. ${until.getDate()}.까지`;
}

/** 한 번의 회차. 마스터 일정에서 시각만 갈아 끼운 모습이다. */
export type Occurrence = EventTimeColumns & {
  /** 어느 회차인지 식별하는 값. event_exceptions.original_start와 같은 규칙. */
  originalStart: string;
};

/** 한 일정이 도는 길이 (종료 - 시작). 회차마다 그대로 유지된다. */
function durationMs(event: EventTimeColumns): number {
  if (event.is_all_day) {
    const start = parseDateKey(event.start_date!);
    const end = parseDateKey(event.end_date!);
    return end.getTime() - start.getTime();
  }
  return new Date(event.end_at!).getTime() - new Date(event.start_at!).getTime();
}

/**
 * 구간 [from, to) 안에 들어오는 회차들.
 *
 * 반복이 아니면 자기 자신 한 건. 반복이면 rrule을 전개한다.
 * 예외(취소·수정)는 여기서 다루지 않는다 — `applyExceptions`가 뒤에 붙는다.
 */
export function expandEvent(event: EventTimeColumns & { rrule: string | null }, from: Date, to: Date): Occurrence[] {
  const timezone = event.timezone || 'Asia/Seoul';

  if (!event.rrule) {
    return [{ ...event, originalStart: masterOriginalStart(event, timezone) }];
  }

  // 시작의 벽시계. 종일이면 그 날 00:00.
  const startWall = event.is_all_day
    ? (() => {
        const date = parseDateKey(event.start_date!);
        return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: 0, minute: 0 };
      })()
    : toWallClock(new Date(event.start_at!), timezone);

  let rule: RRule;
  try {
    rule = new RRule({
      ...RRule.parseString(event.rrule),
      dtstart: wallClockToFloating(startWall),
    });
  } catch {
    // 읽을 수 없는 규칙이면 반복을 포기하고 원본 한 건만 보여 준다.
    // 화면이 통째로 비는 것보다 낫다.
    return [{ ...event, originalStart: masterOriginalStart(event, timezone) }];
  }

  // 조회 구간도 벽시계로 옮긴다. 길이가 긴 일정이 걸치는 경우를 놓치지 않도록
  // 앞쪽으로 일정 길이만큼 넉넉히 잡는다.
  const span = durationMs(event);
  const fromWall = wallClockToFloating(toWallClock(new Date(from.getTime() - span), timezone));
  const toWall = wallClockToFloating(toWallClock(to, timezone));

  const occurrences = rule.between(fromWall, toWall, true).slice(0, MAX_OCCURRENCES);

  return occurrences.map((floating) => {
    const wall = floatingToWallClock(floating);

    if (event.is_all_day) {
      // 종일은 타임존 변환 대상이 아니다. 날짜만 옮긴다.
      const startDate = new Date(wall.year, wall.month - 1, wall.day);
      const endDate = new Date(startDate.getTime() + span);
      return {
        ...event,
        start_date: toDateKey(startDate),
        end_date: toDateKey(endDate),
        start_at: null,
        end_at: null,
        originalStart: fromWallClock({ ...wall, hour: 0, minute: 0 }, timezone).toISOString(),
      };
    }

    const startAt = fromWallClock(wall, timezone);
    return {
      ...event,
      start_at: startAt.toISOString(),
      end_at: addMinutes(startAt, span / 60_000).toISOString(),
      start_date: null,
      end_date: null,
      originalStart: startAt.toISOString(),
    };
  });
}

/** 한 화면에 몇 백 개가 넘게 필요할 일은 없다. 잘못된 규칙이 무한히 돌지 않게 막는다. */
const MAX_OCCURRENCES = 400;

/** 반복이 아닌 일정의 회차 식별자 (= 자기 시작 시각) */
function masterOriginalStart(event: EventTimeColumns, timezone: string): string {
  if (event.is_all_day) {
    const date = parseDateKey(event.start_date!);
    return fromWallClock(
      { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: 0, minute: 0 },
      timezone,
    ).toISOString();
  }
  return new Date(event.start_at!).toISOString();
}

export type EventException = {
  event_id: string;
  original_start: string;
  type: 'CANCELLED' | 'MODIFIED';
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * 회차에 예외를 얹는다. 취소된 회차는 빠지고, 수정된 회차는 값이 덮인다.
 *
 * 예외는 `original_start`로 회차를 찾는다. 시각 표기가 달라도 같은 순간이면
 * 같은 회차이므로 문자열이 아니라 밀리초로 맞춘다.
 */
export function applyExceptions<T extends Occurrence>(
  occurrences: T[],
  exceptions: EventException[],
): T[] {
  if (exceptions.length === 0) return occurrences;

  const byEvent = new Map<string, Map<number, EventException>>();
  for (const exception of exceptions) {
    const key = new Date(exception.original_start).getTime();
    const map = byEvent.get(exception.event_id) ?? new Map();
    map.set(key, exception);
    byEvent.set(exception.event_id, map);
  }

  const result: T[] = [];

  for (const occurrence of occurrences) {
    const eventId = (occurrence as unknown as { id: string }).id;
    const exception = byEvent.get(eventId)?.get(new Date(occurrence.originalStart).getTime());

    if (!exception) {
      result.push(occurrence);
      continue;
    }
    if (exception.type === 'CANCELLED') continue;

    result.push({
      ...occurrence,
      title: exception.title ?? (occurrence as unknown as { title: string }).title,
      description: exception.description ?? (occurrence as unknown as { description: string | null }).description,
      location: exception.location ?? (occurrence as unknown as { location: string | null }).location,
      start_at: exception.start_at ?? occurrence.start_at,
      end_at: exception.end_at ?? occurrence.end_at,
      start_date: exception.start_date ?? occurrence.start_date,
      end_date: exception.end_date ?? occurrence.end_date,
    });
  }

  return result;
}

/**
 * `events.rrule_until` 에 넣을 값 — 마지막 회차의 **종료** 시각.
 *
 * 기간 조회가 `range_end`로 걸러지므로(설계안 6.1 대신 쓰는 파생 컬럼), 이 값이
 * 틀리면 끝난 반복 일정이 계속 조회되거나 살아 있는 일정이 사라진다.
 * 무한 반복이면 null.
 */
export function computeRruleUntil(
  event: EventTimeColumns & { rrule: string | null },
): string | null {
  if (!event.rrule) return null;

  const timezone = event.timezone || 'Asia/Seoul';

  let options: Partial<Options>;
  try {
    options = RRule.parseString(event.rrule);
  } catch {
    return null;
  }

  // UNTIL도 COUNT도 없으면 끝이 없다
  if (!options.until && !options.count) return null;

  const startWall = event.is_all_day
    ? (() => {
        const date = parseDateKey(event.start_date!);
        return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: 0, minute: 0 };
      })()
    : toWallClock(new Date(event.start_at!), timezone);

  const rule = new RRule({ ...options, dtstart: wallClockToFloating(startWall) });
  const all = rule.all((_, index) => index < MAX_OCCURRENCES);
  const last = all[all.length - 1];
  if (!last) return null;

  const lastWall = floatingToWallClock(last);
  const span = durationMs(event);

  if (event.is_all_day) {
    // 종일의 끝은 마지막 날 다음 자정(배타적) — sync_event_range와 같은 규칙
    const startDate = new Date(lastWall.year, lastWall.month - 1, lastWall.day);
    const endDate = new Date(startDate.getTime() + span);
    endDate.setDate(endDate.getDate() + 1);
    return fromWallClock(
      { year: endDate.getFullYear(), month: endDate.getMonth() + 1, day: endDate.getDate(), hour: 0, minute: 0 },
      timezone,
    ).toISOString();
  }

  return new Date(fromWallClock(lastWall, timezone).getTime() + span).toISOString();
}

/**
 * "이 회차 이후 모두 삭제" — 마스터의 UNTIL을 이 회차 직전으로 당긴다.
 * 회차 자체는 남으면 안 되므로 1분 앞을 끝으로 잡는다.
 */
export function truncateRruleBefore(rrule: string, occurrenceStart: Date, timezone: string): string {
  const options = RRule.parseString(rrule);
  const wall = toWallClock(new Date(occurrenceStart.getTime() - 60_000), timezone);

  delete options.count; // COUNT와 UNTIL을 같이 두면 안 된다
  options.until = wallClockToFloating(wall);

  return new RRule(options).toString().replace(/^RRULE:/, '');
}
