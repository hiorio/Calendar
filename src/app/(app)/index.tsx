import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { MonthView, type DayMark } from '@/features/calendar/month-view';
import { useMyCalendars } from '@/features/calendars/queries';
import { groupByDate, useMonthEvents } from '@/features/events/queries';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, formatDayTitle, startOfMonth, toDateKey } from '@/lib/date';
import { formatEventTimeRange } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { isGuest } = useAuth();
  const profile = useProfile();
  const calendars = useMyCalendars();
  const { hidden, toggle } = useCalendarFilter();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());

  const hasCalendars = (calendars.data?.length ?? 0) > 0;

  const events = useMonthEvents(month);

  // 숨긴 캘린더는 서버가 아니라 여기서 거른다. 칩을 눌렀을 때 바로 반영된다.
  const visibleEvents = useMemo(
    () => (events.data ?? []).filter((event) => !hidden.includes(event.calendar_id)),
    [events.data, hidden],
  );

  const byDate = useMemo(() => groupByDate(visibleEvents), [visibleEvents]);

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

  const dayEvents = byDate[toDateKey(selected)] ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <View style={styles.topBar}>
            <View style={styles.topBarText}>
              <Txt variant="caption" tone="tertiary">
                {profile.data ? `${profile.data.nickname}님` : ' '}
              </Txt>
              <Txt variant="title">함께캘린더</Txt>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="설정 열기"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [
                styles.avatar,
                { backgroundColor: pressed ? colors.accentPressed : colors.accent },
              ]}>
              <Txt variant="label" tone="onAccent">
                {profile.data?.nickname?.slice(0, 1) ?? '·'}
              </Txt>
            </Pressable>
          </View>

          {hasCalendars ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {calendars.data!.map((calendar) => {
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
                    <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                    <Txt variant="label" tone={visible ? 'default' : 'tertiary'}>
                      {calendar.name}
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
              onSelect={setSelected}
              onShiftMonth={(delta) => setMonth((current) => addMonths(current, delta))}
              onToday={() => {
                const today = new Date();
                setMonth(startOfMonth(today));
                setSelected(today);
              }}
              marksByDate={marksByDate}
            />
          </Card>

          {hasCalendars ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Txt variant="subtitle">{formatDayTitle(selected)}</Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 날에 일정 추가"
                  onPress={() =>
                    router.push({
                      pathname: '/event-new',
                      params: { date: toDateKey(selected) },
                    })
                  }
                  style={({ pressed }) => [
                    styles.addDay,
                    { backgroundColor: pressed ? colors.accentPressed : colors.accentSoft },
                  ]}>
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Txt variant="label" tone="accent">
                    추가
                  </Txt>
                </Pressable>
              </View>

              <Card flat padded={dayEvents.length === 0}>
                {dayEvents.length === 0 ? (
                  <EmptyState
                    compact
                    icon="sunny-outline"
                    title="이 날은 비어 있어요"
                    description="위 추가를 눌러 첫 일정을 넣어 보세요."
                  />
                ) : (
                  dayEvents.map((event, index) => (
                    <View key={event.key}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${event.title} 열기`}
                        onPress={() =>
                          router.push({
                            pathname: '/event/[id]',
                            // 어느 회차를 열었는지 함께 넘긴다. 반복 일정에서
                            // "이 일정만" 수정·삭제의 대상이 된다.
                            params: { id: event.id, occ: event.originalStart },
                          })
                        }
                        style={({ pressed }) => [
                          styles.eventRow,
                          { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
                        ]}>
                        <View style={[styles.eventBar, { backgroundColor: event.displayColor }]} />
                        <View style={styles.eventText}>
                          <View style={styles.eventTitleRow}>
                            <Txt variant="body" numberOfLines={1} style={styles.eventTitle}>
                              {event.title}
                            </Txt>
                            {event.isRecurring ? (
                              <Ionicons name="repeat" size={14} color={colors.textTertiary} />
                            ) : null}
                          </View>
                          <Txt variant="caption" tone="secondary" numberOfLines={1}>
                            {formatEventTimeRange(event)}
                            {event.location ? ` · ${event.location}` : ''}
                          </Txt>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  ))
                )}
              </Card>
            </View>
          ) : (
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
          )}

          {isGuest ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={({ pressed }) => [
                styles.guestBanner,
                {
                  backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <View style={[styles.guestIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.guestText}>
                <Txt variant="body">계정 만들고 어디서나 이어보기</Txt>
                <Txt variant="caption" tone="secondary">
                  지금 쓰던 내용 그대로, 공유도 가능해집니다
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
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
  topBarText: { gap: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 30,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  eventBar: { width: 4, alignSelf: 'stretch', borderRadius: Radius.pill },
  eventText: { flex: 1, gap: 1 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  eventTitle: { flexShrink: 1 },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  guestIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: { flex: 1, gap: 1 },
  error: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
});
