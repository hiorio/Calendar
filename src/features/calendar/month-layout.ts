/**
 * 월간 캘린더 한 주의 일정 행을 배치한다.
 *
 * 같은 id가 이어진 날짜에 있으면 하나의 구간으로 합치고, 겹치는 일정끼리는
 * 서로 다른 행을 쓴다. 주 경계 밖에도 같은 id가 있으면 다음/이전 주로 이어지는
 * 구간임을 함께 돌려준다.
 */

export type LayoutDayMark = {
  id: string;
  isAllDay: boolean;
};

export type WeekMarkPlacement<T extends LayoutDayMark> = {
  mark: T;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  isSpanning: boolean;
};

type Candidate<T extends LayoutDayMark> = Omit<WeekMarkPlacement<T>, 'lane'> & {
  firstSeen: number;
};

export function layoutWeekMarks<T extends LayoutDayMark>(
  weekKeys: string[],
  marksByDate: Record<string, T[]>,
): WeekMarkPlacement<T>[] {
  if (weekKeys.length === 0) return [];

  const candidatesById = new Map<
    string,
    { mark: T; columns: number[]; firstSeen: number }
  >();
  let firstSeen = 0;

  weekKeys.forEach((dateKey, column) => {
    for (const mark of marksByDate[dateKey] ?? []) {
      const candidate = candidatesById.get(mark.id);
      if (candidate) {
        candidate.columns.push(column);
      } else {
        candidatesById.set(mark.id, { mark, columns: [column], firstSeen: firstSeen++ });
      }
    }
  });

  const previousKey = shiftDateKey(weekKeys[0], -1);
  const nextKey = shiftDateKey(weekKeys[weekKeys.length - 1], 1);
  const previousIds = new Set((marksByDate[previousKey] ?? []).map((mark) => mark.id));
  const nextIds = new Set((marksByDate[nextKey] ?? []).map((mark) => mark.id));

  const candidates: Candidate<T>[] = [...candidatesById.values()].map(
    ({ mark, columns, firstSeen: order }) => {
      const startColumn = Math.min(...columns);
      const endColumn = Math.max(...columns);
      const continuesBefore = startColumn === 0 && previousIds.has(mark.id);
      const continuesAfter = endColumn === weekKeys.length - 1 && nextIds.has(mark.id);

      return {
        mark,
        startColumn,
        endColumn,
        continuesBefore,
        continuesAfter,
        isSpanning: startColumn !== endColumn || continuesBefore || continuesAfter,
        firstSeen: order,
      };
    },
  );

  // 기간 일정을 먼저 놓아 낮은 행에서 끊김 없이 읽히게 한다. 같은 종류 안에서는
  // 왼쪽에서 오른쪽, 긴 구간에서 짧은 구간 순으로 둔다.
  candidates.sort((a, b) => {
    if (a.isSpanning !== b.isSpanning) return a.isSpanning ? -1 : 1;
    if (a.mark.isAllDay !== b.mark.isAllDay) return a.mark.isAllDay ? -1 : 1;
    if (a.startColumn !== b.startColumn) return a.startColumn - b.startColumn;
    const aSpan = a.endColumn - a.startColumn;
    const bSpan = b.endColumn - b.startColumn;
    return bSpan - aSpan || a.firstSeen - b.firstSeen;
  });

  const occupied: boolean[][] = [];

  return candidates.map(({ firstSeen: _firstSeen, ...candidate }) => {
    let lane = occupied.findIndex((row) =>
      row.slice(candidate.startColumn, candidate.endColumn + 1).every((used) => !used),
    );

    if (lane === -1) {
      lane = occupied.length;
      occupied.push(Array.from({ length: weekKeys.length }, () => false));
    }

    for (let column = candidate.startColumn; column <= candidate.endColumn; column += 1) {
      occupied[lane][column] = true;
    }

    return { ...candidate, lane };
  });
}

function shiftDateKey(key: string, amount: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return [
    shifted.getUTCFullYear(),
    `${shifted.getUTCMonth() + 1}`.padStart(2, '0'),
    `${shifted.getUTCDate()}`.padStart(2, '0'),
  ].join('-');
}
