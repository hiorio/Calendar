import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarKeys, useMyCalendars } from '@/features/calendars/queries';
import { EventDetailTools } from '@/features/events/event-detail-tools';
import { eventKeys, useEvent, useOccurrenceException } from '@/features/events/queries';
import { REMINDER_CHOICES, useMyReminders } from '@/features/events/reminders';
import { useProfileById } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatTime, occurrenceTime, parseDateKey } from '@/lib/event-time';
import { isOriginalOccurrence } from '@/lib/recurrence';

export default function EventDetailScreen() {
  const { colors } = useTheme();
  const { id, occ } = useLocalSearchParams<{ id: string; occ?: string }>();
  const queryClient = useQueryClient();
  const hasFocusedOnce = useRef(false);
  const event = useEvent(id);
  const exception = useOccurrenceException(id, occ ?? null);
  const calendars = useMyCalendars();
  const reminders = useMyReminders(id);

  useFocusEffect(
    useCallback(() => {
      // 최초 진입은 각 useQuery가 이미 요청한다. 수정 화면에서 돌아왔을 때만
      // 화면 뒤에 남아 있던 상세 쿼리를 다시 확인한다.
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: eventKeys.exception(id, occ ?? null) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.mine() }),
      ]);
    }, [id, occ, queryClient]),
  );

  const exceptionPending = Boolean(occ) && exception.data === undefined && !exception.isError;
  const creator = useProfileById(event.data?.created_by ?? null);

  function openEdit() {
    router.push({
      pathname: '/event-edit',
      params: { id, ...(occ ? { occ } : {}) },
    } as unknown as Href);
  }

  const unavailable = event.data?.deleted_at || exception.data?.type === 'CANCELLED' ||
    (event.data?.rrule && occ && !isOriginalOccurrence(event.data, new Date(occ)));
  if (!event.data || exceptionPending || unavailable || event.isError || exception.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingHeader}>
          <HeaderButton icon="chevron-back" label="뒤로가기" onPress={() => router.back()} />
        </View>
        <Content style={styles.empty}>
          <Txt variant="body" tone="secondary">
            {unavailable ? '삭제되었거나 취소된 일정입니다.' : event.isError || exception.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
          </Txt>
        </Content>
      </Screen>
    );
  }

  const master = event.data;
  const patch = exception.data?.type === 'MODIFIED' ? exception.data : null;
  const effective = occurrenceTime(master, occ, patch);
  const calendar = calendars.data?.find((item) => item.id === master.calendar_id);
  const title = patch?.title ?? master.title;
  const location = patch?.location ?? master.location;
  const description = patch?.description ?? master.description;
  const reminderLabel =
    reminders.data && reminders.data.length > 0
      ? reminders.data
          .map(
            (minutes) =>
              REMINDER_CHOICES.find((choice) => choice.minutes === minutes)?.label ??
              `${minutes}분 전`,
          )
          .join(' · ')
      : reminders.isError ? '알림 정보를 불러오지 못했습니다' : reminders.isPending ? '알림 확인 중…' : '알림 없음';
  const detailRows: {
    key: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    imageUrl?: string | null;
  }[] = [
    { key: 'reminder', icon: 'alarm-outline', label: reminderLabel },
    {
      key: 'calendar',
      icon: 'calendar-outline',
      label: calendar?.name ?? master.calendarName,
      imageUrl: calendar?.coverUrl,
    },
  ];
  if (location) detailRows.push({ key: 'location', icon: 'location-outline', label: location });
  if (description) {
    detailRows.push({ key: 'description', icon: 'document-text-outline', label: description });
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <HeaderButton icon="chevron-back" label="뒤로가기" onPress={() => router.back()} />
        <ProfileBadge
          imageUrl={creator.data?.avatar_url ?? calendar?.coverUrl ?? null}
          label={creator.data?.nickname ?? calendar?.name ?? '일정'}
        />
        <HeaderButton icon="ellipsis-horizontal" label="일정 수정" onPress={openEdit} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <Content>
          <View style={styles.hero}>
            <Txt variant="display" style={styles.title}>
              {title}
            </Txt>
            <TimeHero event={effective} />
          </View>

          <View
            style={[
              styles.details,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            {detailRows.map((row, index) => (
              <DetailRow
                key={row.key}
                icon={row.icon}
                label={row.label}
                imageUrl={row.imageUrl}
                showSeparator={index < detailRows.length - 1}
              />
            ))}
          </View>

          <View style={styles.activity}>
            <Txt variant="caption" tone="tertiary">
              {formatActivityDate(master.created_at)}
            </Txt>
            <View style={styles.activityLine}>
              <ProfileBadge
                imageUrl={creator.data?.avatar_url ?? null}
                label={creator.data?.nickname ?? '알 수 없는 사용자'}
                compact
              />
              <Txt variant="body" tone="secondary">
                일정을 등록했습니다
              </Txt>
            </View>
          </View>

          <View style={styles.tools}>
            <EventDetailTools
              eventId={id}
              calendarId={master.calendar_id}
              isRecurring={Boolean(master.rrule)}
            />
          </View>
        </Content>
      </ScrollView>
    </Screen>
  );
}

type TimeShape = {
  is_all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
};

function TimeHero({ event }: { event: TimeShape }) {
  const { colors } = useTheme();

  if (event.is_all_day) {
    const start = parseDateKey(event.start_date!);
    const end = parseDateKey(event.end_date!);
    return (
      <View style={[styles.timeSummary, { backgroundColor: colors.surfaceMuted }]}>
        <TimePoint label={event.start_date === event.end_date ? '날짜' : '시작'} date={start} allDay />
        {event.start_date !== event.end_date ? (
          <>
            <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
            <TimePoint label="종료" date={end} allDay />
          </>
        ) : null}
      </View>
    );
  }

  const start = new Date(event.start_at!);
  const end = new Date(event.end_at!);

  return (
    <View style={[styles.timeSummary, { backgroundColor: colors.surfaceMuted }]}>
      <TimePoint label="시작" date={start} />
      <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
      <TimePoint label="종료" date={end} />
    </View>
  );
}

function TimePoint({ label, date, allDay = false }: { label: string; date: Date; allDay?: boolean }) {
  return (
    <View style={styles.timePoint}>
      <Txt variant="caption" tone="secondary" style={styles.timePointLabel}>
        {label}
      </Txt>
      <View style={styles.timePointValue}>
        <Txt variant="subtitle">{formatFullDate(date)}</Txt>
        <Txt variant={allDay ? 'body' : 'title'} tone={allDay ? 'secondary' : 'default'}>
          {allDay ? '종일' : formatTime(date)}
        </Txt>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  imageUrl,
  showSeparator,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  imageUrl?: string | null;
  showSeparator: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.detailRow,
        showSeparator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}>
      <Ionicons name={icon} size={21} color={colors.textSecondary} />
      <Txt variant="body" style={styles.detailLabel}>
        {label}
      </Txt>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} contentFit="cover" style={styles.calendarThumb} />
      ) : null}
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <Ionicons name={icon} size={27} color={colors.accent} />
    </Pressable>
  );
}

function ProfileBadge({
  imageUrl,
  label,
  compact = false,
}: {
  imageUrl: string | null;
  label: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const size = compact ? 25 : 30;
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.profileBadge,
        {
          width: size,
          height: size,
          backgroundColor: colors.accentSoft,
        },
      ]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <Txt variant={compact ? 'micro' : 'caption'} tone="accent">
          {label.slice(0, 1)}
        </Txt>
      )}
    </View>
  );
}

function formatFullDate(date: Date) {
  return `${date.getFullYear()}년 ${formatDate(date)}`;
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatFullDate(date);
}

const styles = StyleSheet.create({
  topBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  loadingHeader: {
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBadge: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  empty: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.lg },
  hero: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: { textAlign: 'left' },
  timeSummary: {
    width: '100%',
    gap: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  timePoint: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  timePointLabel: { minWidth: 28, paddingTop: 2 },
  timePointValue: { flex: 1, gap: 2 },
  timeDivider: { height: StyleSheet.hairlineWidth },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  detailLabel: { flex: 1 },
  calendarThumb: { width: 38, height: 38, borderRadius: Radius.sm },
  activity: {
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  activityLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tools: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
});
