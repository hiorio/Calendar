import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Dimensions, PixelRatio } from 'react-native';

import { ThemePalettes, type AppTheme, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { layoutWeekMarks } from '@/features/calendar/month-layout';
import { calendarColorForScheme, onColor } from '@/features/calendars/colors';
import { useMyCalendars, type MyCalendar } from '@/features/calendars/queries';
import { monthGridRange, useMonthEvents, type EventOccurrence } from '@/features/events/queries';
import { useDeviceCalendarEvents } from '@/features/external-calendars/queries';
import { useMemos, type MemoWithCalendar } from '@/features/memos/queries';
import { buildLockScreenBoardSnapshot } from '@/features/wallpaper/snapshot';
import {
  publishLockScreenBoardSnapshot,
  removeLockScreenBoardOutput,
} from '@/features/wallpaper/storage';
import { addMonths, buildMonthMatrix, startOfMonth, toDateKey, weekdayLabels } from '@/lib/date';
import {
  compareEvents,
  eventDayKeys,
  formatEventTimeRange,
  parseDateKey,
} from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
import { useThemePreference, type SchemePreference } from '@/stores/theme-preference';
import { useWidgetPreference, type WidgetCalendarMode } from '@/stores/widget-preference';
import { Sentry } from '@/lib/observability';

import { CalendarWidget, QuickMemoWidget } from './timeflower-widgets';
import { visibleCalendarIds, widgetTimelineDates } from './widget-policy';
import type {
  TimeFlowerWidgetProps,
  WidgetColorPair,
  WidgetDayItem,
  WidgetEventItem,
  WidgetMemoItem,
  WidgetMonthPage,
  WidgetWeekItem,
} from './types';

function widgetColors(colors: ThemeColors): WidgetColorPair {
  return {
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
    text: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    onAccent: colors.onAccent,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    border: colors.border,
    sunday: colors.sunday,
    saturday: colors.saturday,
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
  availableMonths,
  monthPageCache = new Map(),
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
  availableMonths: Date[];
  monthPageCache?: Map<string, WidgetMonthPage>;
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
  const filledEventKeys = new Set<string>();

  for (const event of visibleEvents) {
    const dayKeys = eventDayKeys(event);
    if (event.is_all_day || dayKeys.length > 1) filledEventKeys.add(event.key);
    for (const key of dayKeys) {
      const dayEvents = eventsByDay.get(key) ?? [];
      dayEvents.push(event);
      eventsByDay.set(key, dayEvents);
    }
  }
  for (const dayEvents of eventsByDay.values()) dayEvents.sort(compareEvents);

  const upcomingVisibleEvents = visibleEvents.filter((event) => eventEnd(event) > now.getTime());
  // 잠금 화면에는 첫 일정만 필요하므로 WidgetKit payload에 두 달치 상세를 전부 복제하지 않는다.
  const eventItems: WidgetEventItem[] = upcomingVisibleEvents.slice(0, 8).map((event) => ({
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

  const layoutMarksByDate: Record<
    string,
    { id: string; isAllDay: boolean; event: EventOccurrence }[]
  > = {};
  for (const [key, dayEvents] of eventsByDay) {
    layoutMarksByDate[key] = dayEvents.map((event) => ({
      // 반복 일정의 서로 다른 회차를 한 기간 일정으로 합치지 않는다.
      id: event.key,
      isAllDay: event.is_all_day,
      event,
    }));
  }

  const makeMonthPage = (pageMonth: Date): WidgetMonthPage => {
    const normalizedMonth = startOfMonth(pageMonth);
    const monthKey = toDateKey(normalizedMonth).slice(0, 7);
    const withToday = (page: WidgetMonthPage): WidgetMonthPage => ({
      ...page,
      weeks: page.weeks.map((week) => ({ ...week, days: week.days.map((day) => ({ ...day, isToday: day.key === toDateKey(now) })) })),
    });
    const cachedPage = monthPageCache.get(monthKey);
    if (cachedPage) return withToday(cachedPage);
    const weeks: WidgetWeekItem[] = buildMonthMatrix(normalizedMonth, weekStart).map((week) => {
      const weekKeys = week.map(toDateKey);
      const placements = layoutWeekMarks(weekKeys, layoutMarksByDate);
      const days: WidgetDayItem[] = week.map((day, dayIndex) => {
        const key = toDateKey(day);
        const dayEvents = eventsByDay.get(key) ?? [];
        return {
          key,
          number: day.getDate(),
          weekday: day.getDay(),
          inMonth:
            day.getMonth() === normalizedMonth.getMonth() &&
            day.getFullYear() === normalizedMonth.getFullYear(),
          isToday: key === toDateKey(now),
          events: dayEvents.slice(0, 1).map((event) => ({
            key: event.key,
            title: event.title,
            filled: filledEventKeys.has(event.key),
            colors: {
              light: calendarColorForScheme(event.displayColor, 'light'),
              dark: calendarColorForScheme(event.displayColor, 'dark'),
            },
            textColors: {
              light: onColor(event.displayColor, 'light'),
              dark: onColor(event.displayColor, 'dark'),
            },
          })),
          eventCount: dayEvents.length,
          // The large widget renders two lanes. Count placements below them instead of
          // subtracting two events, because spanning events can occupy different lanes.
          hiddenEventCount: placements.filter(
            (placement) =>
              placement.lane >= 2 &&
              placement.startColumn <= dayIndex &&
              placement.endColumn >= dayIndex,
          ).length,
          url: deepLink('/day', { date: key }),
        };
      });
      const lanes = Array.from({ length: 3 }, (_, lane) =>
        placements
          .filter((placement) => placement.lane === lane)
          .map((placement) => {
            const event = placement.mark.event;
            return {
              key: `${event.key}-${weekKeys[0]}`,
              title: event.title,
              startColumn: placement.startColumn,
              endColumn: placement.endColumn,
              filled: placement.isSpanning || event.is_all_day,
              colors: {
                light: calendarColorForScheme(event.displayColor, 'light'),
                dark: calendarColorForScheme(event.displayColor, 'dark'),
              },
              textColors: {
                light: onColor(event.displayColor, 'light'),
                dark: onColor(event.displayColor, 'dark'),
              },
              url: deepLink(`/event/${event.id}`, { occ: event.originalStart }),
            };
          }),
      );

      return { key: weekKeys[0], days, lanes };
    });

    const page = {
      key: monthKey,
      title: new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(normalizedMonth),
      shortTitle: new Intl.DateTimeFormat('ko-KR', { month: 'long' }).format(normalizedMonth),
      weeks,
    };
    monthPageCache.set(monthKey, page);
    return withToday(page);
  };
  const currentMonthPage = makeMonthPage(month);
  const adjacentMonthPages = [...new Map(
    availableMonths
      .map((availableMonth) => makeMonthPage(availableMonth))
      .filter((page) => page.key !== currentMonthPage.key)
      .map((page) => [page.key, page]),
  ).values()].sort((a, b) => a.key.localeCompare(b.key));
  const monthWeeks = currentMonthPage.weeks;
  const quickQuery = quickCalendar ? { calendarId: quickCalendar.id } : undefined;

  return {
    layoutRevision: 2,
    viewName: viewName(mode, visibleIds.size),
    dateTitle: new Intl.DateTimeFormat('ko-KR', { month: 'long', weekday: 'short' }).format(now),
    weekdayTitle: new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(now),
    dayNumber: `${now.getDate()}`,
    monthTitle: currentMonthPage.title,
    monthShortTitle: currentMonthPage.shortTitle,
    monthKey: currentMonthPage.key,
    selectedMonthKey: currentMonthPage.key,
    todayMonthKey: toDateKey(startOfMonth(now)).slice(0, 7),
    adjacentMonthPages,
    weekdayLabels: [...weekdayLabels(weekStart)],
    monthWeeks,
    events: eventItems,
    upcomingEventCount: upcomingVisibleEvents.length,
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
    availableMonths: [startOfMonth(now)],
  });
}

function subscribeToPrivacyPreferences(onChange: () => void) {
  const unsubscribe = [
    useWidgetPreference.persist.onHydrate(onChange),
    useWidgetPreference.persist.onFinishHydration(onChange),
    useCalendarFilter.persist.onHydrate(onChange),
    useCalendarFilter.persist.onFinishHydration(onChange),
    useDeviceCalendarPreference.persist.onHydrate(onChange),
    useDeviceCalendarPreference.persist.onFinishHydration(onChange),
  ];
  return () => unsubscribe.forEach((stop) => stop());
}

function privacyPreferencesHydrated() {
  return useWidgetPreference.persist.hasHydrated()
    && useCalendarFilter.persist.hasHydrated()
    && useDeviceCalendarPreference.persist.hasHydrated();
}

/** 앱이 알고 있는 RLS 적용 결과만 WidgetKit 공유 저장소에 복사한다. 세션 키는 넘기지 않는다. */
export function WidgetSync() {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { retainedUserId, user } = useAuth();
  const calendars = useMyCalendars();
  const { weekStart } = useCalendarPreference();
  const hiddenCalendarIds = useCalendarFilter((state) => state.hidden);
  const deviceCalendarConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendarIds = useDeviceCalendarPreference((state) => state.selectedIds);
  const mode = useWidgetPreference((state) => state.calendarMode);
  const selectedCalendarIds = useWidgetPreference((state) => state.selectedCalendarIds);
  const quickAddCalendarId = useWidgetPreference((state) => state.quickAddCalendarId);
  const showQuickActions = useWidgetPreference((state) => state.showQuickActions);
  const wallpaperEnabled = useWidgetPreference((state) => state.wallpaperEnabled);
  const wallpaperLayout = useWidgetPreference((state) => state.wallpaperLayout);
  const wallpaperBackgroundMode = useWidgetPreference(
    (state) => state.wallpaperBackgroundMode,
  );
  const wallpaperShowMemos = useWidgetPreference((state) => state.wallpaperShowMemos);
  const wallpaperBackgroundRevision = useWidgetPreference(
    (state) => state.wallpaperBackgroundRevision,
  );
  const theme = useThemePreference((state) => state.theme);
  const preferredScheme = useThemePreference((state) => state.schemePreference);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [foregroundRevision, setForegroundRevision] = useState(0);
  const privacyReady = useSyncExternalStore(subscribeToPrivacyPreferences, privacyPreferencesHydrated, () => false);
  const lastClearedScope = useRef<string | null>(null);
  const clearAttempts = useRef({ scope: '', count: 0 });
  const publishAttempts = useRef(0);
  const [clearRetry, setClearRetry] = useState(0);
  const previousMonth = useMemo(() => addMonths(monthAnchor, -1), [monthAnchor]);
  const previousEvents = useMonthEvents(previousMonth, weekStart);
  const currentEvents = useMonthEvents(monthAnchor, weekStart);
  const nextMonth = useMemo(() => addMonths(monthAnchor, 1), [monthAnchor]);
  const deviceRange = useMemo(() => ({
    start: monthGridRange(previousMonth, weekStart).start,
    end: monthGridRange(nextMonth, weekStart).end,
  }), [nextMonth, previousMonth, weekStart]);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end, wallpaperEnabled);
  // 홈의 현재 달 요청과 같은 캐시를 먼저 채운 뒤 다음 달을 받는다. 위젯은 화면에
  // 보이지 않으므로 첫 화면 네트워크 대역을 선점할 이유가 없다.
  const nextEvents = useMonthEvents(nextMonth, weekStart, currentEvents.isFetched);
  const memos = useMemos(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reloadStoredLayouts = () => {
      // expo-widgets stores the serialized layout in the App Group. An app update can
      // otherwise leave WidgetKit displaying the previous layout until data changes.
      for (const widget of [CalendarWidget, QuickMemoWidget]) {
        try { widget.reload(); }
        catch (error) { Sentry.captureException(error); }
      }
    };
    const refresh = () => {
      const now = new Date();
      setMonthAnchor(startOfMonth(now));
      setForegroundRevision((value) => value + 1);
      reloadStoredLayouts();
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 100);
    };
    // createWidget has just replaced the stored layout. Reload immediately, even when
    // auth/query hydration has not changed, so an old large-widget snapshot cannot linger.
    reloadStoredLayouts();
    // Keep the query month current even when the app stays open across midnight.
    const now = new Date();
    timer = setTimeout(refresh, +new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - +now + 100);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

  useEffect(() => {
    // 업데이트/설정 오류로 세션을 잠시 못 읽는 동안에는 마지막 사용자의 위젯을
    // 빈 스냅샷으로 덮어쓰지 않는다. 명시적 로그아웃은 연속성 표식도 지운다.
    if (!user && retainedUserId) return;

    const userId = user?.id ?? null;
    // 쿼리가 로딩/실패 중이어도 표시 범위가 바뀌면 이전 스냅샷부터 지운다.
    // AsyncStorage 복원이 끝나기 전 기본값(app/hidden=[])으로 개인 내용을 쓰지 않는다.
    const scope = JSON.stringify({
      userId, privacyReady, mode,
      selected: [...selectedCalendarIds].sort(),
      hidden: [...hiddenCalendarIds].sort(),
      deviceConnected: deviceCalendarConnected,
      deviceSelected: [...selectedDeviceCalendarIds].sort(),
      accessible: calendars.data?.map((calendar) => calendar.id).sort() ?? null,
      quickAddCalendarId,
      wallpaperEnabled,
      wallpaperLayout,
      wallpaperBackgroundMode,
      wallpaperShowMemos,
      wallpaperBackgroundRevision,
    });
    if (lastClearedScope.current !== scope) {
      publishAttempts.current = 0;
      if (clearAttempts.current.scope !== scope) clearAttempts.current = { scope, count: 0 };
      const cleared = emptyProps(theme, preferredScheme);
      let clearSucceeded = true;
      // 한 위젯의 실패가 다른 위젯의 개인정보 삭제를 막지 않는다.
      for (const widget of [CalendarWidget, QuickMemoWidget]) {
        try { widget.updateSnapshot(cleared); }
        catch (error) { clearSucceeded = false; Sentry.captureException(error); }
      }
      try {
        removeLockScreenBoardOutput();
        const now = new Date();
        const screen = Dimensions.get('screen');
        const wallpaperCleared = buildLockScreenBoardSnapshot({
          now,
          expiresAt: now,
          dataStart: startOfMonth(now),
          dataEnd: addMonths(startOfMonth(now), 1),
          screen: { width: screen.width, height: screen.height, scale: PixelRatio.get() },
          layout: wallpaperLayout,
          weekStart,
          showMemos: wallpaperShowMemos,
          backgroundMode: wallpaperBackgroundMode,
          systemScheme,
          theme,
          mode,
          visibleCalendarIds: new Set(),
          events: [],
          memos: [],
          cleared: true,
        });
        if (!publishLockScreenBoardSnapshot(wallpaperCleared)) clearSucceeded = false;
      } catch (error) {
        clearSucceeded = false;
        Sentry.captureException(error);
      }
      if (!clearSucceeded) {
        clearAttempts.current.count += 1;
        if (clearAttempts.current.count < 3) {
          const timer = setTimeout(() => setClearRetry((value) => value + 1), clearAttempts.current.count * 1000);
          return () => clearTimeout(timer);
        }
        return;
      }
      lastClearedScope.current = scope;
    }
    if (!user || !privacyReady) return;
    if (!calendars.data || !currentEvents.data) return;

    const now = new Date();
    const allEvents = [
      ...(previousEvents.data ?? []),
      ...currentEvents.data,
      ...(nextEvents.data ?? []),
    ];
    const availableMonths = [
      ...(previousEvents.data ? [previousMonth] : []),
      monthAnchor,
      ...(nextEvents.data ? [nextMonth] : []),
    ];
    const shared = {
      // 한 번 발행하는 타임라인에서만 재사용한다. 계정/설정 변경 때 공유하지 않는다.
      monthPageCache: new Map<string, WidgetMonthPage>(),
      calendars: calendars.data,
      events: allEvents,
      memos: memos.data ?? [],
      mode,
      selectedCalendarIds,
      hiddenCalendarIds,
      quickAddCalendarId,
      showQuickActions,
      weekStart,
      theme,
      preferredScheme,
      availableMonths,
    };
    const timelineCalendarIds = visibleCalendarIds(
      calendars.data,
      mode,
      selectedCalendarIds,
      hiddenCalendarIds,
    );
    const { dates, expiresAt } = widgetTimelineDates(
      now,
      nextEvents.data ? addMonths(nextMonth, 1) : nextMonth,
      allEvents.filter((event) => timelineCalendarIds.has(event.calendar_id)).map(eventEnd),
    );
    const calendarTimeline = dates
      .map((date) => ({
        date,
        props: makeProps({ ...shared, now: date, month: startOfMonth(date) }),
      }));
    const currentProps = calendarTimeline[0].props;
    // No network in the widget extension: never label missing future data as "no events".
    calendarTimeline.push({ date: expiresAt, props: { ...emptyProps(theme, preferredScheme), expired: true } });

    let publishSucceeded = true;
    try { CalendarWidget.updateTimeline(calendarTimeline); }
    catch (error) { publishSucceeded = false; Sentry.captureException(error); }
    if (memos.data) try { QuickMemoWidget.updateTimeline([
        { date: now, props: currentProps },
        { date: expiresAt, props: { ...emptyProps(theme, preferredScheme), expired: true } },
      ]); }
    catch (error) { publishSucceeded = false; Sentry.captureException(error); }
    if (wallpaperEnabled && (!deviceCalendarConnected || selectedDeviceCalendarIds.length === 0 || deviceEvents.data)) {
      try {
        const screen = Dimensions.get('screen');
        const snapshot = buildLockScreenBoardSnapshot({
          now,
          expiresAt,
          dataStart: previousEvents.data ? previousMonth : monthAnchor,
          dataEnd: nextEvents.data ? addMonths(nextMonth, 1) : addMonths(monthAnchor, 1),
          screen: { width: screen.width, height: screen.height, scale: PixelRatio.get() },
          layout: wallpaperLayout,
          weekStart,
          showMemos: wallpaperShowMemos,
          backgroundMode: wallpaperBackgroundMode,
          systemScheme,
          theme,
          mode,
          visibleCalendarIds: timelineCalendarIds,
          visibleDeviceCalendarIds: new Set(deviceCalendarConnected ? selectedDeviceCalendarIds : []),
          events: allEvents,
          deviceEvents: deviceEvents.data ?? [],
          memos: memos.data ?? [],
        });
        if (!publishLockScreenBoardSnapshot(snapshot)) publishSucceeded = false;
      } catch (error) {
        publishSucceeded = false;
        Sentry.captureException(error);
      }
    }
    if (publishSucceeded) publishAttempts.current = 0;
    else {
      publishAttempts.current += 1;
      if (publishAttempts.current < 3) {
        const timer = setTimeout(() => setClearRetry((value) => value + 1), publishAttempts.current * 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [
    calendars.data,
    clearRetry,
    currentEvents.data,
    deviceCalendarConnected,
    deviceEvents.data,
    foregroundRevision,
    hiddenCalendarIds,
    memos.data,
    mode,
    monthAnchor,
    nextEvents.data,
    nextMonth,
    previousEvents.data,
    previousMonth,
    preferredScheme,
    privacyReady,
    quickAddCalendarId,
    retainedUserId,
    selectedCalendarIds,
    selectedDeviceCalendarIds,
    showQuickActions,
    systemScheme,
    theme,
    user,
    wallpaperEnabled,
    wallpaperBackgroundMode,
    wallpaperBackgroundRevision,
    wallpaperLayout,
    wallpaperShowMemos,
    weekStart,
  ]);

  return null;
}
