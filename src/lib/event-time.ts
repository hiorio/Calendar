/**
 * 일정의 시간 처리. 설계안 3장 원칙을 여기 한 곳에만 둔다.
 *
 *   · 시간 지정 일정 : start_at / end_at (timestamptz). 순간을 가리키므로 UTC로 저장한다.
 *   · 종일 일정      : start_date / end_date (date). **타임존 변환 대상이 아니다.**
 *                      "8월 5일 생일"은 어느 지역에서 보든 8월 5일이다.
 *   · end_date 는 포함(inclusive), 시간 지정의 end_at 은 배타(exclusive)다.
 *
 * 달력 격자용 날짜 계산(`lib/date.ts`)과 섞지 않는다. 저쪽은 화면 좌표, 이쪽은 의미다.
 */

import type { EventRow } from '../types/database.ts';

import { toDateKey } from './date.ts';
import { toWallClock } from './timezone.ts';

/** 기기 타임존. 반복 전개(4단계)의 기준이 되므로 일정마다 저장해 둔다. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

/** 'YYYY-MM-DD' → 로컬 자정. 종일 일정의 date 컬럼을 읽을 때만 쓴다. */
export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * iOS EventKit 종일 일정의 시작/종료를 앱의 포함 날짜 범위로 바꾼다.
 *
 * Expo Calendar는 EventKit의 Date를 UTC ISO 문자열로 직렬화한다. 그래서 한국의
 * 8월 21일 00:00은 `8월 20일 15:00Z`로 넘어올 수 있다. 문자열 앞의 날짜만 자르면
 * 하루 전이 되므로, 실제 순간을 기기 타임존의 벽시계 날짜로 다시 투영한다.
 * 날짜만 들어온 값은 종일 일정의 의미 그대로 두며, 종료일은 EventKit의 배타 범위를
 * 앱 DB의 포함 범위로 바꾼다.
 */
export function deviceAllDayDateRange(
  start: string | Date,
  exclusiveEnd: string | Date,
  timezone = deviceTimezone(),
): { startDate: string; endDate: string } {
  const startDate = deviceAllDayDateKey(start, timezone);
  const exclusiveEndDate = deviceAllDayDateKey(exclusiveEnd, timezone);

  return {
    startDate,
    endDate:
      exclusiveEndDate > startDate ? shiftDateKey(exclusiveEndDate, -1) : startDate,
  };
}

function deviceAllDayDateKey(value: string | Date, timezone: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const wall = toWallClock(value instanceof Date ? value : new Date(value), timezone);
  return `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}`;
}

/** 날짜 키 연산은 UTC 정오에서 해서 서머타임 전환의 영향을 받지 않게 한다. */
function shiftDateKey(key: string, amount: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function pad2(value: number): string {
  return `${value}`.padStart(2, '0');
}

/** 폼이 다루는 모양. 화면은 항상 Date 두 개만 신경 쓴다. */
export type EventTimeForm = {
  isAllDay: boolean;
  /** 종일이면 시각 부분은 무시된다 */
  start: Date;
  end: Date;
};

/** events 테이블에 넣을 시간 컬럼들. is_all_day에 따라 한쪽만 채운다. */
export type EventTimeColumns = Pick<
  EventRow,
  'is_all_day' | 'start_at' | 'end_at' | 'start_date' | 'end_date' | 'timezone'
>;

export function toTimeColumns(form: EventTimeForm, timezone = deviceTimezone()): EventTimeColumns {
  if (form.isAllDay) {
    return {
      is_all_day: true,
      start_date: toDateKey(form.start),
      end_date: toDateKey(form.end),
      start_at: null,
      end_at: null,
      timezone,
    };
  }

  return {
    is_all_day: false,
    start_at: form.start.toISOString(),
    end_at: form.end.toISOString(),
    start_date: null,
    end_date: null,
    timezone,
  };
}

export function fromTimeColumns(event: EventTimeColumns): EventTimeForm {
  if (event.is_all_day) {
    return {
      isAllDay: true,
      start: parseDateKey(event.start_date!),
      end: parseDateKey(event.end_date!),
    };
  }

  return {
    isAllDay: false,
    start: new Date(event.start_at!),
    end: new Date(event.end_at!),
  };
}

/**
 * 종일 ↔ 시간 지정 전환.
 *
 * 그냥 토글만 하면 DB의 `events_time_shape` 검사에 걸린다(종일은 end_date >= start_date,
 * 시간 지정은 end_at > start_at). 전환하는 순간 값을 그 모양에 맞춘다.
 */
export function switchAllDay(form: EventTimeForm, isAllDay: boolean): EventTimeForm {
  if (isAllDay === form.isAllDay) return form;

  if (isAllDay) {
    // 시각을 버리고 날짜만 남긴다. 22:00~다음날 01:00 같은 일정은 이틀짜리가 된다.
    const start = startOfDay(form.start);
    const end = startOfDay(form.end);
    return { isAllDay: true, start, end: end < start ? start : end };
  }

  // 종일 → 시간 지정. 첫날 09:00~10:00을 기본으로 준다.
  const start = new Date(form.start);
  start.setHours(9, 0, 0, 0);
  return { isAllDay: false, start, end: addMinutes(start, 60) };
}

/**
 * 시작을 옮기면 종료도 같은 간격으로 따라간다. 종료가 시작보다 앞서는 상태를
 * 사용자에게 보여 주고 에러로 막느니, 애초에 그 상태를 만들지 않는다.
 */
export function moveStart(form: EventTimeForm, start: Date): EventTimeForm {
  const shift = start.getTime() - form.start.getTime();
  return { ...form, start, end: new Date(form.end.getTime() + shift) };
}

/** 종료는 시작보다 앞설 수 없다. 앞서면 최소 길이로 밀어 준다. */
export function moveEnd(form: EventTimeForm, end: Date): EventTimeForm {
  if (form.isAllDay) {
    return { ...form, end: end < form.start ? form.start : end };
  }
  return { ...form, end: end <= form.start ? addMinutes(form.start, 30) : end };
}

/**
 * 일정이 걸쳐 있는 날짜 키 목록. 월간 격자에 칩을 찍을 때 쓴다.
 *
 * 시간 지정 일정의 종료는 배타적이라, 정확히 자정에 끝나는 일정은 그 날을 칠하지 않는다
 * (22:00~24:00 짜리가 다음 날까지 번지면 안 된다).
 */
export function eventDayKeys(event: EventTimeColumns): string[] {
  if (event.is_all_day) {
    const start = parseDateKey(event.start_date!);
    const last = parseDateKey(event.end_date!);
    return dayKeysFrom(start, daysBetween(start, last) + 1);
  }

  const start = new Date(event.start_at!);
  const end = new Date(event.end_at!);

  const firstDay = startOfDay(start);
  const endDay = startOfDay(end);
  // 종료는 배타적이다. 정확히 자정에 끝나면 그 날은 칠하지 않는다
  // (22:00~24:00 짜리가 다음 날까지 번지면 안 된다).
  const lastDay = end.getTime() === endDay.getTime() ? addDays(endDay, -1) : endDay;

  return dayKeysFrom(firstDay, Math.max(1, daysBetween(firstDay, lastDay) + 1));
}

/**
 * 날짜를 하루씩 더할 때 **정오를 기준으로 잡는다.**
 *
 * 자정 기준 Date에 `setDate(+1)`을 하면, 서머타임 때문에 자정이 존재하지 않는 날
 * (예: America/Santiago의 전환일)에 같은 날짜로 되돌아온다. 그러면 같은 날짜 키가
 * 두 번 나오고 목록이 어긋난다. 정오는 ±1시간이 움직여도 날짜를 넘지 않는다.
 */
function dayKeysFrom(start: Date, count: number): string[] {
  const total = Math.min(Math.max(count, 0), MAX_SPAN_DAYS);
  return Array.from({ length: total }, (_, index) =>
    toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12)),
  );
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);
}

/** 달력상 며칠 차이인가. 시각이 아니라 날짜만 본다. */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** 잘못된 데이터 하나가 렌더링을 멈추게 두지 않는다 */
const MAX_SPAN_DAYS = 400;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * 위젯·바로가기에서 여는 빠른 일정의 기본 시간.
 *
 * 오늘이면 현재보다 뒤인 다음 30분 경계부터 한 시간, 다른 날이면 그 날
 * 09:00~10:00이다. 화면마다 반올림 규칙을 다시 만들지 않도록 여기 둔다.
 */
export function quickEventTime(date: Date, now = new Date()): EventTimeForm {
  const selected = startOfDay(date);
  const today = startOfDay(now);

  if (selected.getTime() !== today.getTime()) {
    const start = new Date(selected);
    start.setHours(9, 0, 0, 0);
    return { isAllDay: false, start, end: addMinutes(start, 60) };
  }

  const start = new Date(now);
  start.setSeconds(0, 0);
  const minutes = start.getMinutes();
  start.setMinutes(minutes < 30 ? 30 : 60, 0, 0);
  return { isAllDay: false, start, end: addMinutes(start, 60) };
}

/** '오후 2:30' */
export function formatTime(date: Date): string {
  const hours = date.getHours();
  const meridiem = hours < 12 ? '오전' : '오후';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${meridiem} ${hour12}:${minutes}`;
}

/** '8월 5일 (수)' */
export function formatDate(date: Date): string {
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

/** 목록 한 줄에 붙는 시간 표기 */
export function formatEventTimeRange(event: EventTimeColumns): string {
  if (event.is_all_day) {
    return event.start_date === event.end_date
      ? '종일'
      : `종일 · ${formatDate(parseDateKey(event.start_date!))} ~ ${formatDate(parseDateKey(event.end_date!))}`;
  }

  const start = new Date(event.start_at!);
  const end = new Date(event.end_at!);
  const sameDay = toDateKey(start) === toDateKey(end);

  return sameDay
    ? `${formatTime(start)} ~ ${formatTime(end)}`
    : `${formatDate(start)} ${formatTime(start)} ~ ${formatDate(end)} ${formatTime(end)}`;
}

/** 정렬: 종일이 먼저, 그다음 시작 시각 순 */
export function compareEvents(a: EventTimeColumns, b: EventTimeColumns): number {
  if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
  if (a.is_all_day) return (a.start_date ?? '').localeCompare(b.start_date ?? '');
  return new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime();
}
