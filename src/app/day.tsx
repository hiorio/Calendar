import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { openDeviceCalendarEvent } from '@/features/external-calendars/device-calendar';
import { useDeviceCalendarEvents } from '@/features/external-calendars/queries';
import type { DeviceCalendarEvent } from '@/features/external-calendars/types';
import { groupByDate, monthGridRange, useMonthEvents } from '@/features/events/queries';
import type { EventOccurrence } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatDayTitle, startOfMonth, toDateKey } from '@/lib/date';
import { formatEventTimeRange, parseDateKey } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';

export default function DayScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const { colors, scheme } = useTheme();
  const { hidden } = useCalendarFilter();
  const { weekStart, showTimeZone } = useCalendarPreference();

  const dateKey = validDateKey(dateParam) ? dateParam : toDateKey(new Date());
  const date = parseDateKey(dateKey);
  const events = useMonthEvents(startOfMonth(date), weekStart);
  const deviceRange = monthGridRange(startOfMonth(date), weekStart);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end);

  const dayEvents = useMemo(() => {
    const visible = (events.data ?? []).filter((event) => !hidden.includes(event.calendar_id));
    return (
      groupByDate<EventOccurrence | DeviceCalendarEvent>([
        ...visible,
        ...(deviceEvents.data ?? []),
      ])[dateKey] ?? []
    );
  }, [dateKey, deviceEvents.data, events.data, hidden]);

  async function openEvent(event: EventOccurrence | DeviceCalendarEvent) {
    if (isDeviceEvent(event)) {
      try {
        await openDeviceCalendarEvent(event.id);
      } catch (error) {
        Alert.alert(
          '외부 일정을 열지 못했습니다',
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }

    router.push({
      pathname: '/event/[id]',
      params: { id: event.id, occ: event.originalStart },
    });
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.heading}>
          <Txt variant="display">{formatDayTitle(date)}</Txt>
          <Txt variant="body" tone="secondary">
            {events.isPending || deviceEvents.isPending
              ? '일정을 불러오는 중…'
              : dayEvents.length
                ? `일정 ${dayEvents.length}개`
                : '등록된 일정이 없습니다'}
          </Txt>
        </View>

        <Button
          label="이 날에 일정 추가"
          onPress={() => router.push({ pathname: '/event-new', params: { date: dateKey } })}
        />

        {events.isPending || deviceEvents.isPending ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : events.isError || deviceEvents.isError ? (
          <Txt variant="caption" tone="danger">
            일정을 불러오지 못했습니다:{' '}
            {((events.error ?? deviceEvents.error) as Error).message}
          </Txt>
        ) : dayEvents.length === 0 ? (
          <Card>
            <EmptyState
              icon="sunny-outline"
              title="이 날은 비어 있어요"
              description="위 버튼을 눌러 첫 일정을 등록해 보세요."
            />
          </Card>
        ) : (
          <Card padded={false}>
            {dayEvents.map((event, index) => (
              <View key={event.key}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${event.title} 일정 상세 보기`}
                  onPress={() => void openEvent(event)}
                  style={({ pressed }) => [
                    styles.eventRow,
                    { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
                  ]}>
                  <View
                    style={[
                      styles.eventBar,
                      {
                        backgroundColor: calendarColorForScheme(event.displayColor, scheme),
                      },
                    ]}
                  />
                  <View style={styles.eventText}>
                    <View style={styles.eventTitleRow}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={styles.eventTitle}>
                        {event.title}
                      </Txt>
                      {isDeviceEvent(event) ? (
                        <Ionicons name="link-outline" size={14} color={colors.textTertiary} />
                      ) : event.isRecurring ? (
                        <Ionicons name="repeat" size={14} color={colors.textTertiary} />
                      ) : null}
                    </View>
                    <Txt variant="caption" tone="secondary" numberOfLines={1}>
                      {formatEventTimeRange(event)}
                      {event.location ? ` · ${event.location}` : ''}
                      {showTimeZone && !event.is_all_day ? ` · ${event.timezone}` : ''}
                    </Txt>
                    <Txt variant="caption" tone="tertiary" numberOfLines={1}>
                      {event.calendarName}
                      {isDeviceEvent(event) ? ' · 외부 · 읽기 전용' : ''}
                    </Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </Content>
    </ScrollView>
  );
}

function validDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDateKey(value);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
}

function isDeviceEvent(
  event: EventOccurrence | DeviceCalendarEvent,
): event is DeviceCalendarEvent {
  return 'kind' in event && event.kind === 'device';
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  heading: { gap: Spacing.xs },
  loading: { paddingVertical: Spacing.xxxl },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 72,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  eventBar: { width: 4, alignSelf: 'stretch', borderRadius: Radius.pill },
  eventText: { flex: 1, gap: 2 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  eventTitle: { flexShrink: 1 },
});
