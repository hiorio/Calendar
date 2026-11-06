import { ThemePalettes, type AppTheme } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import type { EventOccurrence } from '@/features/events/queries';
import type { DeviceCalendarEvent } from '@/features/external-calendars/types';
import type { MemoWithCalendar } from '@/features/memos/queries';
import { toDateKey } from '@/lib/date';
import {
  compareEvents,
  eventDayKeys,
  formatEventTimeRange,
  parseDateKey,
  type EventTimeColumns,
} from '@/lib/event-time';
import type {
  WallpaperBackgroundMode,
  WallpaperLayout,
  WidgetCalendarMode,
} from '@/stores/widget-preference';

import { LOCK_SCREEN_BACKGROUND_FILE } from './constants';
import type { LockScreenBoardSnapshot, WallpaperScreen } from './types';

const MAX_EVENTS_PER_DAY = 12;
const MAX_MEMOS = 8;

function truncateText(value: string, maximumCharacters: number) {
  const characters = Array.from(value);
  return characters.length <= maximumCharacters
    ? value
    : characters.slice(0, maximumCharacters).join('');
}

function eventStart(event: EventTimeColumns) {
  return event.is_all_day
    ? parseDateKey(event.start_date!).getTime()
    : new Date(event.start_at!).getTime();
}

function eventEnd(event: EventTimeColumns) {
  if (!event.is_all_day) return new Date(event.end_at!).getTime();
  const end = parseDateKey(event.end_date!);
  end.setDate(end.getDate() + 1);
  return end.getTime();
}

export function wallpaperViewName(mode: WidgetCalendarMode, count: number) {
  if (mode === 'app') return '앱과 같은 캘린더';
  if (mode === 'all') return '내 모든 캘린더';
  return `선택한 캘린더 ${count}개`;
}

type BuildSnapshotOptions = {
  now: Date;
  expiresAt: Date;
  dataStart: Date;
  dataEnd: Date;
  screen: WallpaperScreen;
  layout: WallpaperLayout;
  weekStart: 'sunday' | 'monday';
  showMemos: boolean;
  backgroundMode: WallpaperBackgroundMode;
  systemScheme: 'light' | 'dark';
  theme: AppTheme;
  mode: WidgetCalendarMode;
  visibleCalendarIds: Set<string>;
  visibleDeviceCalendarIds?: Set<string>;
  events: EventOccurrence[];
  deviceEvents?: DeviceCalendarEvent[];
  memos: MemoWithCalendar[];
  cleared?: boolean;
};

export function buildLockScreenBoardSnapshot({
  now,
  expiresAt,
  dataStart,
  dataEnd,
  screen,
  layout,
  weekStart,
  showMemos,
  backgroundMode,
  systemScheme,
  theme,
  mode,
  visibleCalendarIds,
  visibleDeviceCalendarIds = new Set(),
  events,
  deviceEvents = [],
  memos,
  cleared = false,
}: BuildSnapshotOptions): LockScreenBoardSnapshot {
  const colorScheme = backgroundMode === 'system'
    ? systemScheme
    : backgroundMode === 'light' ? 'light' : 'dark';
  const colors = ThemePalettes[theme][colorScheme];
  const occurrenceByKey = new Map<string, EventOccurrence | DeviceCalendarEvent>([
    ...events.filter((event) => visibleCalendarIds.has(event.calendar_id)),
    ...deviceEvents.filter((event) => visibleDeviceCalendarIds.has(event.calendarId)),
  ].map((event) => [event.key, event]));
  const visibleEvents = [...occurrenceByKey.values()]
    .sort(compareEvents);
  const eventsByDay = new Map<string, (EventOccurrence | DeviceCalendarEvent)[]>();

  for (const event of visibleEvents) {
    for (const key of eventDayKeys(event)) {
      const dayEvents = eventsByDay.get(key) ?? [];
      dayEvents.push(event);
      eventsByDay.set(key, dayEvents);
    }
  }

  const days = [...eventsByDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, dayEvents]) => {
      dayEvents.sort(compareEvents);
      return {
        key,
        eventCount: dayEvents.length,
        events: dayEvents.slice(0, MAX_EVENTS_PER_DAY).map((event) => ({
          key: event.key,
          title: truncateText(event.title, 120),
          timeLabel: truncateText(formatEventTimeRange(event), 40),
          calendarName: truncateText(event.calendarName, 80),
          color: calendarColorForScheme(event.displayColor, colorScheme),
          isAllDay: event.is_all_day,
          sortAt: eventStart(event),
          endAt: eventEnd(event),
        })),
      };
    });

  return {
    version: 1,
    cleared,
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    dataStart: toDateKey(dataStart),
    dataEnd: toDateKey(dataEnd),
    screen: {
      width: Math.max(320, Math.round(screen.width)),
      height: Math.max(568, Math.round(screen.height)),
      scale: Math.max(1, Math.min(4, screen.scale)),
    },
    layout,
    weekStart,
    showMemos,
    ...(backgroundMode === 'photo' ? { backgroundFile: LOCK_SCREEN_BACKGROUND_FILE } : {}),
    viewName: wallpaperViewName(mode, visibleCalendarIds.size),
    palette: {
      background: colors.background,
      backgroundAlt: colors.accentSoft,
      card: colors.surface,
      cardMuted: colors.surfaceMuted,
      text: colors.text,
      textSecondary: colors.textSecondary,
      textTertiary: colors.textTertiary,
      accent: colors.accent,
      onAccent: colors.onAccent,
      sunday: colors.sunday,
      saturday: colors.saturday,
    },
    days: cleared ? [] : days,
    memos:
      cleared || !showMemos
        ? []
        : memos
            .filter((memo) => !memo.done && visibleCalendarIds.has(memo.calendar_id))
            .slice(0, MAX_MEMOS)
            .map((memo) => ({
              id: memo.id,
              content: truncateText(memo.content, 200),
              calendarName: truncateText(memo.calendarName, 80),
              color: calendarColorForScheme(memo.calendarColor, colorScheme),
            })),
  };
}
