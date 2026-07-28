/**
 * 달력 격자에 필요한 만큼의 날짜 유틸.
 *
 * 여기 있는 것은 전부 **로컬 타임존 기준의 "달력상 날짜"** 계산이다.
 * 일정의 시각 계산(반복 전개, 타임존 변환)은 4단계의 별도 모듈에서 다룬다.
 * 설계안 3장 원칙과 섞지 않는다.
 */

/** 'YYYY-MM-DD'. 종일 일정의 date 컬럼과 같은 표기 */
export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * 월간 격자. 일요일 시작으로 앞뒤 달을 채워 항상 6주(42칸)를 돌려준다.
 * 주 수가 달마다 바뀌면 달을 넘길 때 격자 높이가 출렁인다.
 */
export type WeekStart = 'sunday' | 'monday';

export function buildMonthMatrix(month: Date, weekStart: WeekStart = 'sunday'): Date[][] {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  const startDay = weekStart === 'monday' ? 1 : 0;
  const leadingDays = (first.getDay() - startDay + 7) % 7;
  gridStart.setDate(1 - leadingDays);

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + week * 7 + day);
      return date;
    }),
  );
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayLabels(weekStart: WeekStart): readonly string[] {
  return weekStart === 'monday'
    ? [...WEEKDAY_LABELS.slice(1), WEEKDAY_LABELS[0]]
    : WEEKDAY_LABELS;
}

/** ISO 8601 주 번호. 월요일 시작이며 그 주의 목요일이 속한 해를 기준으로 센다. */
export function isoWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * 기기 Intl이 단기(음력) 달력을 지원할 때만 음력 일을 돌려준다.
 * 지원하지 않는 웹 엔진에서는 빈 값으로 두어 잘못된 날짜를 보여 주지 않는다.
 */
export function formatLunarDay(date: Date): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR-u-ca-dangi', { day: 'numeric' });
    const day = formatter.formatToParts(date).find((part) => part.type === 'day')?.value;
    return day ? `음 ${day}` : null;
  } catch {
    return null;
  }
}

export function formatMonthTitle(month: Date): string {
  return `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
}

export function formatDayTitle(date: Date): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;
}
