import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { MonthView, type DayMark } from '@/features/calendar/month-view';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import {
  useDeviceCalendarEvents,
  useDeviceCalendars,
} from '@/features/external-calendars/queries';
import { groupByDate, monthGridRange, useMonthEvents } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, formatMonthTitle, startOfMonth, toDateKey } from '@/lib/date';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';

export default function CalendarScreen() {
  const { colors, scheme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
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
  const lastPressedDate = useRef<string | null>(null);

  const hasCalendars = (calendars.data?.length ?? 0) > 0;

  const events = useMonthEvents(month, weekStart);
  const deviceCalendars = useDeviceCalendars();
  const deviceRange = useMemo(() => monthGridRange(month, weekStart), [month, weekStart]);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end);

  // 숨긴 캘린더는 서버가 아니라 여기서 거른다. 칩을 눌렀을 때 바로 반영된다.
  const visibleEvents = useMemo(
    () => (events.data ?? []).filter((event) => !hidden.includes(event.calendar_id)),
    [events.data, hidden],
  );

  const byDate = useMemo(
    () => groupByDate([...visibleEvents, ...(deviceEvents.data ?? [])]),
    [deviceEvents.data, visibleEvents],
  );
  const dayCellMinHeight = Math.max(70, Math.min(104, Math.floor((windowHeight - 245) / 6)));

  const marksByDate = useMemo(() => {
    const marks: Record<string, DayMark[]> = {};
    for (const [key, list] of Object.entries(byDate)) {
      marks[key] = list.map((event) => ({
        id: event.key,
        title: event.title,
        color: event.displayColor,
      }));
    }
    return marks;
  }, [byDate]);

  function selectDate(date: Date) {
    const dateKey = toDateKey(date);
    const isSecondPress =
      lastPressedDate.current === dateKey && toDateKey(selected) === dateKey;

    if (isSecondPress) {
      lastPressedDate.current = null;
      router.push({ pathname: '/day', params: { date: dateKey } });
      return;
    }

    setSelected(date);
    lastPressedDate.current = dateKey;
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          // 함께 쓰는 캘린더라 남이 고친 것을 당겨서 받아올 수 있어야 한다
          <RefreshControl
            refreshing={
              calendars.isRefetching || events.isRefetching || deviceEvents.isRefetching
            }
            onRefresh={() => {
              calendars.refetch();
              events.refetch();
              deviceCalendars.refetch();
              deviceEvents.refetch();
            }}
            tintColor={colors.textTertiary}
          />
        }>
        <Content>
          {/* 앱 이름은 두지 않는다. 사용자는 자기가 어떤 앱을 열었는지 알고,
              이 자리는 화면에서 가장 값진 곳이다. 대신 가장 자주 보고 만지는
              것 — 지금 보고 있는 달 — 을 올린다. */}
          <View style={styles.topBar}>
            <Txt variant="title">{formatMonthTitle(month)}</Txt>
            <View style={styles.monthNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이전 달"
                onPress={() => {
                  lastPressedDate.current = null;
                  setMonth((current) => addMonths(current, -1));
                }}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
                ]}>
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 달"
                onPress={() => {
                  lastPressedDate.current = null;
                  setMonth((current) => addMonths(current, 1));
                }}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
                ]}>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {hasCalendars || (deviceCalendars.data?.length ?? 0) > 0 ? (
            <ScrollView
              horizontal
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
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                      ]}
                    />
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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="캘린더 관리"
                onPress={() => router.push('/calendars')}
                style={[styles.chip, styles.manageChip, { borderColor: colors.border }]}>
                <Ionicons name="options-outline" size={14} color={colors.textSecondary} />
                <Txt variant="label" tone="secondary">
                  관리
                </Txt>
              </Pressable>
            </ScrollView>
          ) : null}

          <Card flat padded={false} style={styles.calendarCard}>
            <MonthView
              month={month}
              selected={selected}
              onSelect={selectDate}
              marksByDate={marksByDate}
              dayCellMinHeight={dayCellMinHeight}
              weekStart={weekStart}
              showWeekNumbers={showWeekNumbers}
              showLunar={showLunar}
              colorSaturday={colorSaturday}
            />
          </Card>

          {!hasCalendars ? (
            <View style={styles.section}>
              <Card>
                <EmptyState
                  icon="people-outline"
                  title="함께 볼 캘린더를 만들어요"
                  description={'가족·연인·친구와 하나의 캘린더를 공유합니다.\n만든 뒤 초대 링크를 보내면 됩니다.'}
                  action={
                    <Button
                      label="캘린더 만들기"
                      block={false}
                      onPress={() => router.push('/calendar-new')}
                    />
                  }
                />
              </Card>
            </View>
          ) : null}

          {calendars.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              캘린더를 불러오지 못했습니다: {(calendars.error as Error).message}
            </Txt>
          ) : null}

          {events.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              일정을 불러오지 못했습니다: {(events.error as Error).message}
            </Txt>
          ) : null}

          {deviceEvents.isError ? (
            <Txt variant="caption" tone="danger" style={styles.error}>
              외부 일정을 불러오지 못했습니다: {(deviceEvents.error as Error).message}
            </Txt>
          ) : null}
        </Content>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // 탭바가 마지막 요소를 덮지 않도록 넉넉히
  scroll: { paddingBottom: Spacing.xxxl * 2 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
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
  calendarCard: { marginHorizontal: Spacing.md, paddingVertical: Spacing.lg },
  section: { gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl },
  error: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
});
