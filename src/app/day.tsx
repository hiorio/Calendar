import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import { openDeviceCalendarEvent } from '@/features/external-calendars/device-calendar';
import { useDeviceCalendarEvents } from '@/features/external-calendars/queries';
import type { DeviceCalendarEvent } from '@/features/external-calendars/types';
import { groupByDate, monthGridRange, useMonthEvents } from '@/features/events/queries';
import type { EventOccurrence } from '@/features/events/queries';
import { stickerByKey } from '@/features/stickers/catalog';
import { StickerPicker } from '@/features/stickers/sticker-picker';
import { useDayStickers } from '@/features/stickers/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatDayTitle, formatLunarDate, startOfMonth, toDateKey } from '@/lib/date';
import { formatTime, parseDateKey } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';

export default function DayScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const { colors, scheme } = useTheme();
  const { hidden } = useCalendarFilter();
  const { weekStart, showTimeZone } = useCalendarPreference();
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [featuredCalendarId, setFeaturedCalendarId] = useState<string | null>(null);

  const dateKey = validDateKey(dateParam) ? dateParam : toDateKey(new Date());
  const date = parseDateKey(dateKey);
  const lunarDate = formatLunarDate(date);
  const calendars = useMyCalendars();
  const stickers = useDayStickers(dateKey);
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

  const visibleStickers = useMemo(
    () =>
      (stickers.data ?? []).filter((sticker) => !hidden.includes(sticker.calendarId)),
    [hidden, stickers.data],
  );
  const visibleCalendars = useMemo(
    () => (calendars.data ?? []).filter((calendar) => !hidden.includes(calendar.id)),
    [calendars.data, hidden],
  );
  const featuredSticker =
    visibleStickers.find((sticker) => sticker.calendarId === featuredCalendarId) ??
    visibleStickers[0] ??
    null;
  const featuredDefinition = stickerByKey(featuredSticker?.stickerKey);

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
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <Content style={styles.content}>
          <View style={[styles.hero, featuredDefinition && styles.decoratedHero]}>
            {featuredDefinition ? (
              <Image
                accessibilityLabel={`${featuredDefinition.label} 스티커`}
                contentFit="cover"
                source={featuredDefinition.source}
                style={StyleSheet.absoluteFill}
                transition={160}
              />
            ) : null}

            <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />

            <View style={styles.header}>
              <View
                style={[
                  styles.heading,
                  featuredDefinition && styles.decoratedHeading,
                ]}>
                {featuredDefinition ? (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      styles.headingBackdrop,
                      { backgroundColor: colors.surface },
                    ]}
                  />
                ) : null}
                <Txt variant="title">{formatDayTitle(date)}</Txt>
                {lunarDate ? (
                  <Txt variant="body" tone="tertiary">
                    {lunarDate}
                  </Txt>
                ) : null}
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDayTitle(date)} 스티커 꾸미기`}
                  accessibilityHint="대상 캘린더와 스티커를 선택합니다"
                  hitSlop={8}
                  onPress={() => setStickerPickerOpen(true)}
                  style={({ pressed }) => [
                    styles.roundButton,
                    {
                      backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                      borderColor: colors.border,
                      shadowColor: colors.shadow,
                    },
                  ]}>
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDayTitle(date)} 일정 추가`}
                  accessibilityHint="선택한 날짜의 일정 입력 화면을 엽니다"
                  hitSlop={8}
                  onPress={() =>
                    router.push({ pathname: '/event-new', params: { date: dateKey } })
                  }
                  style={({ pressed }) => [
                    styles.roundButton,
                    {
                      backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                      borderColor: colors.border,
                      shadowColor: colors.shadow,
                    },
                  ]}>
                  <Ionicons name="add" size={22} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {featuredSticker && featuredDefinition ? (
              <View style={styles.calendarBadge}>
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.badgeBackdrop,
                    { backgroundColor: colors.surface },
                  ]}
                />
                <View
                  style={[
                    styles.badgeDot,
                    {
                      backgroundColor: calendarColorForScheme(
                        featuredSticker.calendarColor,
                        scheme,
                      ),
                    },
                  ]}
                />
                <Txt variant="micro" numberOfLines={1}>
                  {featuredSticker.calendarName}
                  {visibleStickers.length > 1 ? ` 외 ${visibleStickers.length - 1}` : ''}
                </Txt>
              </View>
            ) : null}
          </View>

          {events.isPending || deviceEvents.isPending ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : events.isError || deviceEvents.isError ? (
            <Txt variant="caption" tone="danger" style={styles.feedback}>
              일정을 불러오지 못했습니다:{' '}
              {((events.error ?? deviceEvents.error) as Error).message}
            </Txt>
          ) : dayEvents.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={28} color={colors.textTertiary} />
              <Txt variant="body" tone="secondary">
                등록된 일정이 없습니다
              </Txt>
            </View>
          ) : (
            <View style={styles.eventList}>
              {dayEvents.map((event, index) => {
                const times = eventTimes(event);
                return (
                  <Pressable
                    key={event.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${event.title} 일정 상세 보기`}
                    onPress={() => void openEvent(event)}
                    style={({ pressed }) => [
                      styles.eventRow,
                      index === 0 && styles.firstEventRow,
                      { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
                    ]}>
                    <View style={styles.timeColumn}>
                      <Txt variant="label" numberOfLines={1}>
                        {times.start}
                      </Txt>
                      {times.end ? (
                        <Txt variant="caption" tone="tertiary" numberOfLines={1}>
                          {times.end}
                        </Txt>
                      ) : null}
                    </View>
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
                        <Txt variant="subtitle" numberOfLines={1} style={styles.eventTitle}>
                          {event.title}
                        </Txt>
                        {isDeviceEvent(event) ? (
                          <Ionicons name="link-outline" size={14} color={colors.textTertiary} />
                        ) : event.isRecurring ? (
                          <Ionicons name="repeat" size={14} color={colors.textTertiary} />
                        ) : null}
                      </View>
                      {event.location || showTimeZone || isDeviceEvent(event) ? (
                        <Txt variant="caption" tone="tertiary" numberOfLines={1}>
                          {[
                            event.location,
                            showTimeZone && !event.is_all_day ? event.timezone : null,
                            isDeviceEvent(event) ? `${event.calendarName} · 읽기 전용` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Txt>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Content>
      </ScrollView>

      <StickerPicker
        calendars={visibleCalendars}
        calendarsPending={calendars.isPending}
        date={dateKey}
        dateLabel={formatDayTitle(date)}
        dayStickers={stickers.data ?? []}
        onApplied={setFeaturedCalendarId}
        onClose={() => setStickerPickerOpen(false)}
        visible={stickerPickerOpen}
      />
    </>
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

function eventTimes(event: EventOccurrence | DeviceCalendarEvent): {
  start: string;
  end: string | null;
} {
  if (event.is_all_day) return { start: '종일', end: null };
  return {
    start: formatTime(new Date(event.start_at!)),
    end: formatTime(new Date(event.end_at!)),
  };
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxxl },
  content: { flex: 0 },
  hero: {
    position: 'relative',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  decoratedHero: {
    minHeight: 210,
    overflow: 'hidden',
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  grabber: {
    width: 44,
    height: 4,
    alignSelf: 'center',
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  heading: { gap: Spacing.xs },
  decoratedHeading: {
    overflow: 'hidden',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  headingBackdrop: { opacity: 0.86 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  roundButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    ...Elevation.card,
  },
  calendarBadge: {
    position: 'absolute',
    left: Spacing.xl,
    bottom: Spacing.md,
    maxWidth: '65%',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  badgeBackdrop: { opacity: 0.86 },
  badgeDot: { width: 7, height: 7, borderRadius: Radius.pill },
  loading: { marginHorizontal: Spacing.xl, paddingVertical: Spacing.xxxl },
  feedback: { marginHorizontal: Spacing.xl, marginTop: Spacing.xl },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl * 2,
  },
  eventList: { marginTop: Spacing.xl, paddingHorizontal: Spacing.xl },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 68,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  firstEventRow: { paddingTop: 0 },
  timeColumn: { width: 76, gap: 2, paddingTop: 2 },
  eventBar: { width: 3, borderRadius: Radius.pill, marginRight: Spacing.md },
  eventText: { flex: 1, justifyContent: 'center', gap: 2 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  eventTitle: { flexShrink: 1 },
});
