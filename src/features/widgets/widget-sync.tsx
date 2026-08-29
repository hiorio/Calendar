import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ThemePalettes, type AppTheme, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars, type MyCalendar } from '@/features/calendars/queries';
import { useMonthEvents, type EventOccurrence } from '@/features/events/queries';
import { useMemos, type MemoWithCalendar } from '@/features/memos/queries';
import { addMonths, buildMonthMatrix, startOfMonth, toDateKey, weekdayLabels } from '@/lib/date';
import { formatEventTimeRange, parseDateKey } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useThemePreference, type SchemePreference } from '@/stores/theme-preference';
import { useWidgetPreference, type WidgetCalendarMode } from '@/stores/widget-preference';

import { CalendarWidget, QuickMemoWidget } from './timeflower-widgets';
import type {
  TimeFlowerWidgetProps,
  WidgetColorPair,
  WidgetDayItem,
  WidgetEventItem,
  WidgetMemoItem,
} from './types';

function widgetColors(colors: ThemeColors): WidgetColorPair {
  return {
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
    text: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    border: colors.border,
  };
}

function deepLink(pathname: string, queryParams?: Record<string, string>) {
  return Linking.createURL(pathname, queryParams ? { queryParams } : undefined);
}

function eventStart(event: EventOccurrence) {
  return event.is_all_day
    ? parseDateKey(event.start_date!).getTime()
    : new Date(event.start_at!).getTime();
}

function eventEnd(event: EventOccurrence) {
  if (!event.is_all_day) return new Date(event.end_at!).getTime();
  const end = parseDateKey(event.end_date!);
  end.setDate(end.getDate() + 1);
  return end.getTime();
}

function visibleCalendarIds(
  calendars: MyCalendar[],
  mode: WidgetCalendarMode,
  selectedCalendarIds: string[],
  hiddenCalendarIds: string[],
) {
  const available = new Set(calendars.map((calendar) => calendar.id));
  if (mode === 'app') {
    const hidden = new Set(hiddenCalendarIds);
    return new Set(calendars.filter((calendar) => !hidden.has(calendar.id)).map((calendar) => calendar.id));
  }
  if (mode === 'custom') {
    const selected = selectedCalendarIds.filter((id) => available.has(id));
    return new Set(selected.length > 0 ? selected : calendars.map((calendar) => calendar.id));
  }
  return available;
}

function viewName(mode: WidgetCalendarMode, count: number) {
  if (mode === 'app') return '앱과 같은 캘린더';
  if (mode === 'all') return '내 모든 캘린더';
  return `선택한 캘린더 ${count}개`;
}

function makeProps({
  month,
  now,
  calendars,
  events,
  memos,
  mode,
  selectedCalendarIds,
  hiddenCalendarIds,
  quickAddCalendarId,
  showQuickActions,
  weekStart,
  theme,
  preferredScheme,
}: {
  month: Date;
  now: Date;
  calendars: MyCalendar[];
  events: EventOccurrence[];
  memos: MemoWithCalendar[];
  mode: WidgetCalendarMode;
  selectedCalendarIds: string[];
  hiddenCalendarIds: string[];
  quickAddCalendarId: string | null;
  showQuickActions: boolean;
  weekStart: 'sunday' | 'monday';
  theme: AppTheme;
  preferredScheme: SchemePreference;
}): TimeFlowerWidgetProps {
  const visibleIds = visibleCalendarIds(
    calendars,
    mode,
    selectedCalendarIds,
    hiddenCalendarIds,
  );
  const quickCalendar =
    calendars.find((calendar) => calendar.id === quickAddCalendarId) ??
    (calendars.length === 1 ? calendars[0] : null);
  const occurrenceByKey = new Map(events.map((event) => [event.key, event]));
  const visibleEvents = [...occurrenceByKey.values()]
    .filter((event) => visibleIds.has(event.calendar_id))
    .sort((a, b) => eventStart(a) - eventStart(b));
  const eventsByDay = new Map<string, EventOccurrence[]>();

  for (const event of visibleEvents) {
    const start = event.is_all_day ? parseDateKey(event.start_date!) : new Date(event.start_at!);
    const end = event.is_all_day ? parseDateKey(event.end_date!) : new Date(event.end_at!);
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
    if (!event.is_all_day && end.getHours() === 0 && end.getMinutes() === 0) last.setDate(last.getDate() - 1);
    while (cursor <= last) {
      const key = toDateKey(cursor);
      const dayEvents = eventsByDay.get(key) ?? [];
      dayEvents.push(event);
      eventsByDay.set(key, dayEvents);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const eventItems: WidgetEventItem[] = visibleEvents.map((event) => ({
    id: event.id,
    title: event.title,
    timeLabel: formatEventTimeRange(event),
    calendarName: event.calendarName,
    colors: {
      light: calendarColorForScheme(event.displayColor, 'light'),
      dark: calendarColorForScheme(event.displayColor, 'dark'),
    },
    url: deepLink(`/event/${event.id}`, { occ: event.originalStart }),
    sortAt: eventStart(event),
    endAt: eventEnd(event),
  }));

  const memoItems: WidgetMemoItem[] = memos
    .filter((memo) => !memo.done && visibleIds.has(memo.calendar_id))
    .slice(0, 5)
    .map((memo) => ({
      id: memo.id,
      content: memo.content,
      calendarName: memo.calendarName,
      colors: {
        light: calendarColorForScheme(memo.calendarColor, 'light'),
        dark: calendarColorForScheme(memo.calendarColor, 'dark'),
      },
    }));

  const monthWeeks: WidgetDayItem[][] = buildMonthMatrix(month, weekStart).map((week) =>
    week.map((day) => {
      const key = toDateKey(day);
      return {
        key,
        number: day.getDate(),
        inMonth: day.getMonth() === month.getMonth(),
        isToday: key === toDateKey(now),
        eventColors: (eventsByDay.get(key) ?? []).slice(0, 3).map((event) => ({
          light: calendarColorForScheme(event.displayColor, 'light'),
          dark: calendarColorForScheme(event.displayColor, 'dark'),
        })),
        url: deepLink('/day', { date: key }),
      };
    }),
  );
  const quickQuery = quickCalendar ? { calendarId: quickCalendar.id } : undefined;

  return {
    viewName: viewName(mode, visibleIds.size),
    dateTitle: new Intl.DateTimeFormat('ko-KR', { month: 'long', weekday: 'short' }).format(now),
    dayNumber: `${now.getDate()}`,
    monthTitle: new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(month),
    weekdayLabels: [...weekdayLabels(weekStart)],
    monthWeeks,
    events: eventItems,
    memos: memoItems,
    calendarUrl: deepLink('/'),
    quickEventUrl: deepLink('/quick-event', {
      date: toDateKey(now),
      ...(quickQuery ?? {}),
    }),
    quickMemoUrl: deepLink('/quick-memo', quickQuery),
    memosUrl: deepLink('/memos'),
    showQuickActions,
    preferredScheme,
    palettes: {
      light: widgetColors(ThemePalettes[theme].light),
      dark: widgetColors(ThemePalettes[theme].dark),
    },
  };
}

function emptyProps(theme: AppTheme, preferredScheme: SchemePreference): TimeFlowerWidgetProps {
  const now = new Date();
  return makeProps({
    month: startOfMonth(now),
    now,
    calendars: [],
    events: [],
    memos: [],
    mode: 'all',
    selectedCalendarIds: [],
    hiddenCalendarIds: [],
    quickAddCalendarId: null,
    showQuickActions: false,
    weekStart: 'sunday',
    theme,
    preferredScheme,
  });
}

/** 앱이 알고 있는 RLS 적용 결과만 WidgetKit 공유 저장소에 복사한다. 세션 키는 넘기지 않는다. */
export function WidgetSync() {
  const { user } = useAuth();
  const calendars = useMyCalendars();
  const { weekStart } = useCalendarPreference();
  const hiddenCalendarIds = useCalendarFilter((state) => state.hidden);
  const mode = useWidgetPreference((state) => state.calendarMode);
  const selectedCalendarIds = useWidgetPreference((state) => state.selectedCalendarIds);
  const quickAddCalendarId = useWidgetPreference((state) => state.quickAddCalendarId);
  const showQuickActions = useWidgetPreference((state) => state.showQuickActions);
  const theme = useThemePreference((state) => state.theme);
  const preferredScheme = useThemePreference((state) => state.schemePreference);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const lastWidgetUserId = useRef<string | null | undefined>(undefined);
  const currentEvents = useMonthEvents(monthAnchor, weekStart);
  const nextMonth = useMemo(() => addMonths(monthAnchor, 1), [monthAnchor]);
  // 홈의 현재 달 요청과 같은 캐시를 먼저 채운 뒤 다음 달을 받는다. 위젯은 화면에
  // 보이지 않으므로 첫 화면 네트워크 대역을 선점할 이유가 없다.
  const nextEvents = useMonthEvents(nextMonth, weekStart, currentEvents.isFetched);
  const memos = useMemos();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setMonthAnchor(startOfMonth(new Date()));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (lastWidgetUserId.current !== userId) {
      lastWidgetUserId.current = userId;
      const cleared = emptyProps(theme, preferredScheme);
      CalendarWidget.updateSnapshot(cleared);
      QuickMemoWidget.updateSnapshot(cleared);
      return;
    }
    if (!user) return;
    if (!calendars.data || !currentEvents.data || !nextEvents.data || !memos.data) return;

    const now = new Date();
    const allEvents = [...currentEvents.data, ...nextEvents.data];
    const shared = {
      calendars: calendars.data,
      events: allEvents,
      memos: memos.data,
      mode,
      selectedCalendarIds,
      hiddenCalendarIds,
      quickAddCalendarId,
      showQuickActions,
      weekStart,
      theme,
      preferredScheme,
    };
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 7);
    horizon.setHours(0, 0, 0, 0);
    const timelineDates = new Map<number, Date>([[now.getTime(), now]]);
    for (let day = 1; day <= 7; day += 1) {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      timelineDates.set(midnight.getTime(), midnight);
    }
    for (const event of allEvents) {
      const end = eventEnd(event);
      if (end > now.getTime() && end <= horizon.getTime()) timelineDates.set(end, new Date(end));
    }
    timelineDates.set(nextMonth.getTime(), nextMonth);

    const calendarTimeline = [...timelineDates.values()]
      .sort((a, b) => a.getTime() - b.getTime())
      .map((date) => ({
        date,
        props: makeProps({ ...shared, now: date, month: startOfMonth(date) }),
      }));
    const currentProps = calendarTimeline[0].props;

    CalendarWidget.updateTimeline(calendarTimeline);
    QuickMemoWidget.updateTimeline([{ date: now, props: currentProps }]);
  }, [
    calendars.data,
    currentEvents.data,
    hiddenCalendarIds,
    memos.data,
    mode,
    monthAnchor,
    nextEvents.data,
    nextMonth,
    preferredScheme,
    quickAddCalendarId,
    selectedCalendarIds,
    showQuickActions,
    theme,
    user,
    weekStart,
  ]);

  return null;
}
