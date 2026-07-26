/**
 * IANA 타임존 변환.
 *
 * 반복 일정은 `events.timezone`의 **벽시계** 기준으로 전개해야 한다(설계안 3장).
 * "매주 화요일 9시"는 서머타임이 바뀌어도 9시고, 사용자가 여행 중이어도 9시다.
 * 그러니 회차는 벽시계로 세고, 저장/표시할 때만 실제 순간으로 바꾼다.
 *
 * 별도 타임존 라이브러리를 넣지 않고 `Intl`이 이미 갖고 있는 tz 데이터를 쓴다.
 * (luxon을 넣으면 rrule의 tzid 지원을 쓸 수 있지만, 그 하나 때문에 의존성을
 *  더할 이유가 없다.)
 */

/** 벽시계 시각. 어느 타임존인지는 이 값 자체가 모른다. */
export type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // hour12:false만 주면 엔진에 따라 자정을 24시로 돌려주고 날짜 해석이 갈린다.
      // h23으로 못 박아 0~23으로 고정한다.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** 어떤 순간을 주어진 타임존에서 보면 몇 시인지 */
export function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** 그 타임존에서의 UTC 오프셋(ms). 서머타임이 반영된 값이다. */
function offsetMs(instant: Date, timeZone: string): number {
  const wall = toWallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // 초 단위는 버리고 분까지만 본다. 오프셋이 분 단위가 아닌 타임존은 없다.
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * 그 타임존의 벽시계 시각이 가리키는 실제 순간.
 *
 * 오프셋을 알려면 순간이 필요하고, 순간을 알려면 오프셋이 필요하다. 한 번 추정해
 * 보정하고, 보정한 값의 오프셋이 다르면(서머타임 경계) 한 번 더 맞춘다.
 */
export function fromWallClock(wall: WallClock, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));
  const corrected = new Date(naive - offsetMs(firstGuess, timeZone));

  return corrected;
}

/**
 * 벽시계를 "UTC인 척하는" Date로 만든다.
 *
 * rrule은 tzid 없이 쓰면 Date를 UTC로 다룬다. 회차를 벽시계 공간에서 세려면
 * 이 표현이 필요하다. **이 Date를 실제 순간으로 착각하면 안 된다.**
 */
export function wallClockToFloating(wall: WallClock): Date {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute));
}

export function floatingToWallClock(floating: Date): WallClock {
  return {
    year: floating.getUTCFullYear(),
    month: floating.getUTCMonth() + 1,
    day: floating.getUTCDate(),
    hour: floating.getUTCHours(),
    minute: floating.getUTCMinutes(),
  };
}
