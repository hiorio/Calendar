import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Card } from '@/components/ui/card';
import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import {
  homeMonthSnapshotKey,
  type HomeMonthSnapshot,
} from '@/features/calendar/home-snapshot-cache';
import {
  loadHomeMonthSnapshot,
  saveHomeMonthSnapshot,
} from '@/features/calendar/home-snapshot';
import {
  MonthView,
  type DayMark,
  type DayStickerMark,
} from '@/features/calendar/month-view';
import { MonthPicker } from '@/features/calendar/month-picker';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import {
  useDeviceCalendarEvents,
  useDeviceCalendars,
} from '@/features/external-calendars/queries';
import { groupByDate, monthGridRange, useMonthEvents } from '@/features/events/queries';
import { useMonthStickers } from '@/features/stickers/queries';
import { useTheme } from '@/hooks/use-theme';
import {
  addMonths,
  formatMonthTitle,
  startOfMonth,
  toDateKey,
  type WeekStart,
} from '@/lib/date';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';

export default function CalendarScreen() {
  const { colors, scheme } = useTheme();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const calendars = useMyCalendars();
  const { hidden, toggle } = useCalendarFilter();
  const selectedDeviceCalendarIds = useDeviceCalendarPreference((state) => state.selectedIds);
  const toggleDeviceCalendar = useDeviceCalendarPreference((state) => state.toggleCalendar);
  const {
    weekStart,
    showWeekNumbers,
    showLunar,
    colorSaturday,
  } = useCalendarPreference();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [loadAdjacentMonths, setLoadAdjacentMonths] = useState(false);
  const [cachedMonth, setCachedMonth] = useState<{
    userId: string;
    snapshot: HomeMonthSnapshot;
  } | null>(null);
  const monthPagerRef = useRef<ScrollView>(null);
  const calendarWidth = Math.min(windowWidth, MaxContentWidth);
  const previousMonth = useMemo(() => addMonths(month, -1), [month]);
  const nextMonth = useMemo(() => addMonths(month, 1), [month]);
  const snapshotKey = useMemo(
    () => homeMonthSnapshotKey(month, weekStart),
    [month, weekStart],
  );

  const moveMonth = useCallback((amount: number) => {
    setMonth((current) => addMonths(current, amount));
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      monthPagerRef.current?.scrollTo({ x: calendarWidth, animated: false });
    });
  }, [calendarWidth]);

  const settleMonthPage = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / calendarWidth);
      if (page === 1) return;

      const direction = page < 1 ? -1 : 1;

      // 세 페이지를 계속 재사용한다. 보이는 옆 달을 새 현재 달로 만든 뒤,
      // 같은 프레임에 가운데 페이지로 되돌려 연속 스와이프처럼 보이게 한다.
      moveMonth(direction);
      monthPagerRef.current?.scrollTo({ x: calendarWidth, animated: false });
    },
    [calendarWidth, moveMonth],
  );

  const deviceCalendars = useDeviceCalendars();
  const previousPage = useCalendarMonthData(
    previousMonth,
    weekStart,
    hidden,
    loadAdjacentMonths,
  );
  const currentPage = useCalendarMonthData(month, weekStart, hidden);
  const nextPage = useCalendarMonthData(nextMonth, weekStart, hidden, loadAdjacentMonths);

  useEffect(() => {
    let active = true;
    const userId = user?.id;

    if (!userId) {
      return () => {
        active = false;
      };
    }

    void loadHomeMonthSnapshot(userId, snapshotKey)
      .then((snapshot) => {
        if (active) setCachedMonth(snapshot ? { userId, snapshot } : null);
      })
      .catch(() => {
        if (active) setCachedMonth(null);
      });

    return () => {
      active = false;
    };
  }, [snapshotKey, user?.id]);

  useEffect(() => {
    if (loadAdjacentMonths || !currentPage.events.isFetched) return;

    // 현재 달이 화면에 반영된 다음 프레임을 먼저 내보낸 뒤 옆 달을 준비한다.
    const timeout = setTimeout(() => setLoadAdjacentMonths(true), 120);
    return () => clearTimeout(timeout);
  }, [currentPage.events.isFetched, loadAdjacentMonths]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || !currentPage.events.isSuccess || !currentPage.stickers.isSuccess) return;

    const snapshot: HomeMonthSnapshot = {
      key: snapshotKey,
      savedAt: new Date().toISOString(),
      marksByDate: currentPage.marksByDate,
      stickersByDate: currentPage.stickersByDate,
    };

    void saveHomeMonthSnapshot(userId, snapshot).catch(() => undefined);
  }, [
    currentPage.events.isSuccess,
    currentPage.marksByDate,
    currentPage.stickers.isSuccess,
    currentPage.stickersByDate,
    snapshotKey,
    user?.id,
  ]);

  const cachedCurrentMonth =
    cachedMonth !== null &&
    cachedMonth.userId === user?.id &&
    cachedMonth.snapshot.key === snapshotKey
      ? cachedMonth.snapshot
      : null;

  function selectDate(date: Date) {
    const dateKey = toDateKey(date);
    const isFocused = toDateKey(selected) === dateKey;

    if (isFocused) {
      router.push({ pathname: '/day', params: { date: dateKey } });
      return;
    }

    setSelected(date);
  }

  function selectMonth(nextMonth: Date) {
    monthPagerRef.current?.scrollTo({ x: calendarWidth, animated: false });
    setMonth(nextMonth);
    setSelected(nextMonth);
  }

  return (
    <Screen>
      <Content style={styles.content}>
          {/* 앱 이름은 두지 않는다. 사용자는 자기가 어떤 앱을 열었는지 알고,
              이 자리는 화면에서 가장 값진 곳이다. 대신 가장 자주 보고 만지는
              것 — 지금 보고 있는 달 — 을 올린다. */}
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${formatMonthTitle(month)}. 연도와 월 선택`}
              accessibilityState={{ expanded: monthPickerOpen }}
              hitSlop={8}
              onPress={() => setMonthPickerOpen(true)}
              style={({ pressed }) => [
                styles.monthTitleButton,
                pressed && { backgroundColor: colors.surfacePressed },
              ]}>
              <Txt variant="title">{formatMonthTitle(month)}</Txt>
              <Ionicons name="chevron-down" size={17} color={colors.textTertiary} />
            </Pressable>
          </View>

          <View style={styles.calendarFilterFrame}>
            <ScrollView
              horizontal
              style={styles.calendarStrip}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {(calendars.data ?? []).map((calendar) => {
                const visible = !hidden.includes(calendar.id);
                return (
                  <Pressable
                    key={calendar.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: visible }}
                    accessibilityLabel={`${calendar.name} ${visible ? '숨기기' : '표시하기'}`}
                    onPress={() => toggle(calendar.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: visible ? colors.surface : 'transparent',
                        borderColor: visible ? colors.border : colors.borderStrong,
                        opacity: visible ? 1 : 0.55,
                      },
                    ]}>
                    {calendar.coverUrl ? (
                      <View
                        style={[
                          styles.calendarThumbnailFrame,
                          {
                            borderColor: calendarColorForScheme(calendar.color, scheme),
                          },
                        ]}>
                        <Image
                          source={{ uri: calendar.coverUrl }}
                          style={styles.calendarThumbnail}
                          contentFit="cover"
                          transition={120}
                        />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                        ]}
                      />
                    )}
                    <Txt variant="label" tone={visible ? 'default' : 'tertiary'}>
                      {calendar.name}
                    </Txt>
                  </Pressable>
                );
              })}

              {deviceCalendars.data?.map((calendar) => {
                const visible = selectedDeviceCalendarIds.includes(calendar.id);
                return (
                  <Pressable
                    key={`device:${calendar.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: visible }}
                    accessibilityLabel={`${calendar.title} 외부 캘린더 ${visible ? '숨기기' : '표시하기'}`}
                    onPress={() => toggleDeviceCalendar(calendar.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: visible ? colors.surface : 'transparent',
                        borderColor: visible ? colors.border : colors.borderStrong,
                        opacity: visible ? 1 : 0.55,
                      },
                    ]}>
                    <Ionicons name="link-outline" size={13} color={colors.textTertiary} />
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                      ]}
                    />
                    <Txt variant="label" tone={visible ? 'default' : 'tertiary'}>
                      {calendar.title}
                    </Txt>
                  </Pressable>
                );
              })}

              {calendars.isError ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="캘린더 필터 다시 불러오기"
                  onPress={() => calendars.refetch()}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: colors.dangerSoft,
                      borderColor: colors.danger,
                    },
                  ]}>
                  <Ionicons name="refresh-outline" size={14} color={colors.danger} />
                  <Txt variant="label" tone="danger">
                    필터 다시 불러오기
                  </Txt>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="캘린더 필터 관리"
                onPress={() => router.push('/calendars')}
                style={[styles.chip, styles.manageChip, { borderColor: colors.border }]}>
                <Ionicons name="options-outline" size={14} color={colors.textSecondary} />
                <Txt variant="label" tone="secondary">
                  필터 관리
                </Txt>
              </Pressable>
            </ScrollView>
          </View>

          <Card
            flat
            padded={false}
            style={styles.calendarCard}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${formatMonthTitle(month)} 월간 캘린더`}
            accessibilityActions={[
              { name: 'decrement', label: '이전 달' },
              { name: 'increment', label: '다음 달' },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'decrement') moveMonth(-1);
              if (event.nativeEvent.actionName === 'increment') moveMonth(1);
            }}>
            <ScrollView
              ref={monthPagerRef}
              horizontal
              pagingEnabled
              bounces={false}
              directionalLockEnabled
              disableIntervalMomentum
              decelerationRate="fast"
              contentOffset={{ x: calendarWidth, y: 0 }}
              snapToAlignment="start"
              snapToInterval={calendarWidth}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={settleMonthPage}
              style={styles.monthPager}>
              {[
                {
                  key: 'previous',
                  value: previousMonth,
                  marksByDate: previousPage.marksByDate,
                  stickersByDate: previousPage.stickersByDate,
                },
                {
                  key: 'current',
                  value: month,
                  marksByDate: currentPage.events.isSuccess
                    ? currentPage.marksByDate
                    : (cachedCurrentMonth?.marksByDate ?? currentPage.marksByDate),
                  stickersByDate: currentPage.stickers.isSuccess
                    ? currentPage.stickersByDate
                    : (cachedCurrentMonth?.stickersByDate ?? currentPage.stickersByDate),
                },
                {
                  key: 'next',
                  value: nextMonth,
                  marksByDate: nextPage.marksByDate,
                  stickersByDate: nextPage.stickersByDate,
                },
              ].map((page) => (
                <View
                  key={page.key}
                  accessibilityElementsHidden={page.key !== 'current'}
                  importantForAccessibility={
                    page.key === 'current' ? 'auto' : 'no-hide-descendants'
                  }
                  style={[styles.monthPage, { width: calendarWidth }]}>
                  <MonthView
                    month={page.value}
                    selected={selected}
                    onSelect={selectDate}
                    marksByDate={page.marksByDate}
                    stickersByDate={page.stickersByDate}
                    fillAvailableSpace
                    weekStart={weekStart}
                    showWeekNumbers={showWeekNumbers}
                    showLunar={showLunar}
                    colorSaturday={colorSaturday}
                  />
                </View>
              ))}
            </ScrollView>
          </Card>

          {calendars.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              캘린더를 불러오지 못했습니다: {(calendars.error as Error).message}
            </Txt>
          ) : null}

          {currentPage.events.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              일정을 불러오지 못했습니다: {(currentPage.events.error as Error).message}
            </Txt>
          ) : null}

          {currentPage.deviceEvents.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              외부 일정을 불러오지 못했습니다:{' '}
              {(currentPage.deviceEvents.error as Error).message}
            </Txt>
          ) : null}

          {currentPage.stickers.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              스티커를 불러오지 못했습니다:{' '}
              {(currentPage.stickers.error as Error).message}
            </Txt>
          ) : null}
      </Content>
      {monthPickerOpen ? (
        <MonthPicker
          onChange={selectMonth}
          onClose={() => setMonthPickerOpen(false)}
          value={month}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { overflow: 'hidden', paddingBottom: Spacing.sm },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 0,
    paddingBottom: Spacing.sm,
  },
  monthTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: -Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  calendarFilterFrame: { flexShrink: 0, height: 44, zIndex: 1 },
  calendarStrip: { flex: 1 },
  chipRow: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 32,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  manageChip: { gap: Spacing.xs },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  calendarThumbnailFrame: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
  },
  calendarThumbnail: { width: '100%', height: '100%' },
  calendarCard: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 0,
    paddingVertical: Spacing.sm,
  },
  monthPager: { flex: 1, width: '100%' },
  monthPage: { height: '100%' },
  error: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
});

function useCalendarMonthData(
  month: Date,
  weekStart: WeekStart,
  hidden: string[],
  enabled = true,
) {
  const events = useMonthEvents(month, weekStart, enabled);
  const deviceRange = useMemo(() => monthGridRange(month, weekStart), [month, weekStart]);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end, enabled);
  const stickers = useMonthStickers(
    toDateKey(deviceRange.start),
    toDateKey(deviceRange.end),
    enabled,
  );

  // 숨긴 캘린더는 서버가 아니라 여기서 거른다. 칩을 누르면 세 페이지 모두 바로 바뀐다.
  const visibleEvents = useMemo(
    () => (events.data ?? []).filter((event) => !hidden.includes(event.calendar_id)),
    [events.data, hidden],
  );
  const byDate = useMemo(
    () => groupByDate([...visibleEvents, ...(deviceEvents.data ?? [])]),
    [deviceEvents.data, visibleEvents],
  );

  const marksByDate = useMemo(() => {
    const marks: Record<string, DayMark[]> = {};
    for (const [key, list] of Object.entries(byDate)) {
      marks[key] = list.map((event) => ({
        id: event.key,
        title: event.title,
        color: event.displayColor,
        isAllDay: event.is_all_day,
      }));
    }
    return marks;
  }, [byDate]);

  const stickersByDate = useMemo(() => {
    const marks: Record<string, DayStickerMark[]> = {};
    for (const sticker of stickers.data ?? []) {
      if (hidden.includes(sticker.calendarId)) continue;
      (marks[sticker.date] ??= []).push({
        id: sticker.id,
        stickerKey: sticker.stickerKey,
      });
    }
    return marks;
  }, [hidden, stickers.data]);

  return { events, deviceEvents, stickers, marksByDate, stickersByDate };
}
