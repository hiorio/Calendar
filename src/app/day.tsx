import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import { openDeviceCalendarEvent } from '@/features/external-calendars/device-calendar';
import { useDeviceCalendarEvents } from '@/features/external-calendars/queries';
import type { DeviceCalendarEvent } from '@/features/external-calendars/types';
import {
  groupByDate,
  monthGridRange,
  useDeleteEvent,
  useMonthEvents,
} from '@/features/events/queries';
import type { EventOccurrence } from '@/features/events/queries';
import { stickerByKey } from '@/features/stickers/catalog';
import { StickerPicker } from '@/features/stickers/sticker-picker';
import { useDayStickers } from '@/features/stickers/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm, notify } from '@/lib/confirm';
import { formatDayTitle, formatLunarDate, startOfMonth, toDateKey } from '@/lib/date';
import { formatTime, parseDateKey } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';

export default function DayScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { hidden } = useCalendarFilter();
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [featuredCalendarId, setFeaturedCalendarId] = useState<string | null>(null);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const [dateKey, setDateKey] = useState(() =>
    validDateKey(dateParam) ? dateParam : toDateKey(new Date()),
  );
  const pagerRef = useRef<ScrollView>(null);
  const pagerWidth = Math.min(windowWidth, MaxContentWidth);

  const date = parseDateKey(dateKey);
  const previousDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const calendars = useMyCalendars();
  const stickers = useDayStickers(dateKey);
  const visibleCalendars = useMemo(
    () => (calendars.data ?? []).filter((calendar) => !hidden.includes(calendar.id)),
    [calendars.data, hidden],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x: pagerWidth, animated: false });
    });
  }, [pagerWidth]);

  const moveDate = useCallback(
    (amount: number) => {
      const nextKey = toDateKey(addDays(parseDateKey(dateKey), amount));
      setDateKey(nextKey);
      setFeaturedCalendarId(null);
      router.setParams({ date: nextKey });
      requestAnimationFrame(() => {
        pagerRef.current?.scrollTo({ x: pagerWidth, animated: false });
      });
    },
    [dateKey, pagerWidth],
  );

  const settleDatePage = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / pagerWidth);
      if (page === 1) return;
      moveDate(page < 1 ? -1 : 1);
    },
    [moveDate, pagerWidth],
  );

  return (
    <>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={pagerScrollEnabled}
        directionalLockEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settleDatePage}
        style={[styles.pager, { width: pagerWidth, backgroundColor: colors.background }]}
        contentOffset={{ x: pagerWidth, y: 0 }}>
        {[
          { key: 'previous', value: previousDate },
          { key: 'current', value: date },
          { key: 'next', value: nextDate },
        ].map((page) => (
          <View
            key={`${page.key}:${toDateKey(page.value)}`}
            accessibilityElementsHidden={page.key !== 'current'}
            importantForAccessibility={page.key === 'current' ? 'auto' : 'no-hide-descendants'}
            style={{ width: pagerWidth }}>
            <DayPage
              date={page.value}
              featuredCalendarId={page.key === 'current' ? featuredCalendarId : null}
              onOpenSticker={
                page.key === 'current' ? () => setStickerPickerOpen(true) : undefined
              }
              onEventSwipeStart={
                page.key === 'current' ? () => setPagerScrollEnabled(false) : undefined
              }
              onEventSwipeSettled={
                page.key === 'current' ? () => setPagerScrollEnabled(true) : undefined
              }
            />
          </View>
        ))}
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

function DayPage({
  date,
  featuredCalendarId,
  onOpenSticker,
  onEventSwipeStart,
  onEventSwipeSettled,
}: {
  date: Date;
  featuredCalendarId: string | null;
  onOpenSticker?: () => void;
  onEventSwipeStart?: () => void;
  onEventSwipeSettled?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { hidden } = useCalendarFilter();
  const { weekStart, showTimeZone } = useCalendarPreference();
  const dateKey = toDateKey(date);
  const lunarDate = formatLunarDate(date);
  const stickers = useDayStickers(dateKey);
  const events = useMonthEvents(startOfMonth(date), weekStart);
  const deviceRange = monthGridRange(startOfMonth(date), weekStart);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end);
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const activeSwipeableRef = useRef<SwipeableMethods | null>(null);

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
    () => (stickers.data ?? []).filter((sticker) => !hidden.includes(sticker.calendarId)),
    [hidden, stickers.data],
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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View
          style={[
            styles.hero,
            featuredDefinition && styles.decoratedHero,
            featuredDefinition?.display === 'cutout' && {
              backgroundColor: colors.accentSoft,
            },
          ]}>
          {featuredDefinition ? (
            <Image
              accessibilityLabel={`${featuredDefinition.label} 스티커`}
              contentFit={featuredDefinition.display === 'cutout' ? 'contain' : 'cover'}
              source={featuredDefinition.source}
              style={StyleSheet.absoluteFill}
              transition={160}
            />
          ) : null}

          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />

          <View style={styles.header}>
            <View style={[styles.heading, featuredDefinition && styles.decoratedHeading]}>
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
                disabled={!onOpenSticker}
                hitSlop={8}
                onPress={onOpenSticker}
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
                disabled={!onOpenSticker}
                hitSlop={8}
                onPress={() => router.push({ pathname: '/event-new', params: { date: dateKey } })}
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

        {events.isPending || deviceEvents.isLoading ? (
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
              if (isDeviceEvent(event)) {
                return (
                  <DayEventRow
                    key={event.key}
                    event={event}
                    index={index}
                    showTimeZone={showTimeZone}
                    onPress={() => void openEvent(event)}
                  />
                );
              }

              return (
                <SwipeableEventRow
                  key={event.key}
                  event={event}
                  index={index}
                  showTimeZone={showTimeZone}
                  onPress={() => void openEvent(event)}
                  onSwipeStart={(methods) => {
                    activeSwipeableRef.current = methods;
                    onEventSwipeStart?.();
                  }}
                  onSwipeSettled={(methods) => {
                    if (activeSwipeableRef.current === methods) {
                      activeSwipeableRef.current = null;
                      onEventSwipeSettled?.();
                    }
                  }}
                  onClose={(methods) => {
                    if (openSwipeableRef.current === methods) openSwipeableRef.current = null;
                  }}
                  onWillOpen={(methods) => {
                    if (openSwipeableRef.current !== methods) {
                      openSwipeableRef.current?.close();
                      openSwipeableRef.current = methods;
                    }
                  }}
                />
              );
            })}
          </View>
        )}
      </Content>
    </ScrollView>
  );
}

function SwipeableEventRow({
  event,
  index,
  showTimeZone,
  onPress,
  onSwipeStart,
  onSwipeSettled,
  onWillOpen,
  onClose,
}: {
  event: EventOccurrence;
  index: number;
  showTimeZone: boolean;
  onPress: () => void;
  onSwipeStart?: (methods: SwipeableMethods) => void;
  onSwipeSettled?: (methods: SwipeableMethods) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
}) {
  const { colors } = useTheme();
  const remove = useDeleteEvent(event.id);
  const swipeableRef = useRef<SwipeableMethods>(null);

  async function requestDelete() {
    swipeableRef.current?.close();

    const ok = await confirm({
      title: event.isRecurring
        ? '이 날짜의 일정을 삭제할까요?'
        : '이 일정을 삭제할까요?',
      message: event.isRecurring
        ? '반복 일정의 다른 날짜는 그대로 유지됩니다.'
        : '함께 보는 사람들의 캘린더에서도 사라집니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    remove.mutate(
      {
        scope: event.isRecurring ? 'THIS' : 'ALL',
        originalStart: event.isRecurring ? event.originalStart : undefined,
        rrule: event.rrule,
        timezone: event.timezone,
      },
      {
        onError: (error) =>
          notify('일정을 삭제하지 못했습니다', error instanceof Error ? error.message : String(error)),
      },
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={!remove.isPending}
      enableTrackpadTwoFingerGesture
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      containerStyle={[styles.swipeableRow, { backgroundColor: colors.danger }]}
      childrenContainerStyle={{ backgroundColor: colors.background }}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableOpenStartDrag={() => {
        if (swipeableRef.current) onSwipeStart?.(swipeableRef.current);
      }}
      onSwipeableCloseStartDrag={() => {
        if (swipeableRef.current) onSwipeStart?.(swipeableRef.current);
      }}
      onSwipeableOpen={() => {
        if (swipeableRef.current) onSwipeSettled?.(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) {
          onSwipeSettled?.(swipeableRef.current);
          onClose(swipeableRef.current);
        }
      }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${event.title} 삭제`}
          disabled={remove.isPending}
          onPress={() => void requestDelete()}
          style={({ pressed }) => [
            styles.deleteAction,
            {
              backgroundColor: colors.danger,
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          {remove.isPending ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={22} color={colors.onAccent} />
              <Txt variant="micro" tone="onAccent">
                삭제
              </Txt>
            </>
          )}
        </Pressable>
      )}>
      <DayEventRow
        event={event}
        index={index}
        showTimeZone={showTimeZone}
        onPress={onPress}
        onDelete={() => void requestDelete()}
      />
    </Swipeable>
  );
}

function DayEventRow({
  event,
  index,
  showTimeZone,
  onPress,
  onDelete,
}: {
  event: EventOccurrence | DeviceCalendarEvent;
  index: number;
  showTimeZone: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const times = eventTimes(event);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title} 일정 상세 보기`}
      accessibilityHint={onDelete ? '왼쪽으로 쓸어 넘기면 삭제 버튼이 나타납니다' : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: '삭제' }] : undefined}
      onAccessibilityAction={(action) => {
        if (action.nativeEvent.actionName === 'delete') onDelete?.();
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventRow,
        index === 0 && styles.firstEventRow,
        { backgroundColor: pressed ? colors.surfacePressed : colors.background },
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
          { backgroundColor: calendarColorForScheme(event.displayColor, scheme) },
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
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
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
  pager: { flex: 1, alignSelf: 'center' },
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
  swipeableRow: { overflow: 'hidden', borderRadius: Radius.sm },
  deleteAction: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
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
