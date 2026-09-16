import type { DayMark, DayStickerMark } from '@/features/calendar/month-view';
import type { WeekStart } from '@/lib/date';

export const HOME_SNAPSHOT_VERSION = 1;
const MAX_CACHED_MONTHS = 3;

export type HomeMonthSnapshot = {
  key: string;
  savedAt: string;
  marksByDate: Record<string, DayMark[]>;
  stickersByDate: Record<string, DayStickerMark[]>;
};

export type HomeSnapshotCache = {
  version: typeof HOME_SNAPSHOT_VERSION;
  userId: string;
  months: HomeMonthSnapshot[];
};

export function homeMonthSnapshotKey(month: Date, weekStart: WeekStart): string {
  const monthNumber = `${month.getMonth() + 1}`.padStart(2, '0');
  return `${month.getFullYear()}-${monthNumber}:${weekStart}`;
}

export function parseHomeSnapshotCache(raw: string | null): HomeSnapshotCache | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    return isHomeSnapshotCache(value) ? value : null;
  } catch {
    return null;
  }
}

export function upsertHomeMonthSnapshot(
  cache: HomeSnapshotCache | null,
  userId: string,
  snapshot: HomeMonthSnapshot,
): HomeSnapshotCache {
  const months = cache?.userId === userId ? cache.months : [];

  return {
    version: HOME_SNAPSHOT_VERSION,
    userId,
    months: [snapshot, ...months.filter((month) => month.key !== snapshot.key)].slice(
      0,
      MAX_CACHED_MONTHS,
    ),
  };
}

function isHomeSnapshotCache(value: unknown): value is HomeSnapshotCache {
  if (!isRecord(value)) return false;
  if (value.version !== HOME_SNAPSHOT_VERSION || typeof value.userId !== 'string') return false;
  return Array.isArray(value.months) && value.months.every(isHomeMonthSnapshot);
}

function isHomeMonthSnapshot(value: unknown): value is HomeMonthSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === 'string' &&
    typeof value.savedAt === 'string' &&
    isMarkMap(value.marksByDate, isDayMark) &&
    isMarkMap(value.stickersByDate, isDayStickerMark)
  );
}

function isMarkMap<T>(
  value: unknown,
  isMark: (mark: unknown) => mark is T,
): value is Record<string, T[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (marks) => Array.isArray(marks) && marks.every((mark) => isMark(mark)),
    )
  );
}

function isDayMark(value: unknown): value is DayMark {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.color === 'string' &&
    typeof value.isAllDay === 'boolean'
  );
}

function isDayStickerMark(value: unknown): value is DayStickerMark {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.stickerKey === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
