import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventDetailTools } from '@/features/events/event-detail-tools';
import { useEvent, useOccurrenceException } from '@/features/events/queries';
import { REMINDER_CHOICES, useMyReminders } from '@/features/events/reminders';
import { useProfileById } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatTime, parseDateKey } from '@/lib/event-time';

export default function EventDetailScreen() {
  const { colors } = useTheme();
  const { id, occ } = useLocalSearchParams<{ id: string; occ?: string }>();
  const event = useEvent(id);
  const exception = useOccurrenceException(id, occ ?? null);
  const calendars = useMyCalendars();
  const reminders = useMyReminders(id);

  const exceptionPending = Boolean(occ) && !exception.isFetched;
  const creator = useProfileById(event.data?.created_by ?? null);

  function openEdit() {
    router.push({
      pathname: '/event-edit',
      params: { id, ...(occ ? { occ } : {}) },
    } as unknown as Href);
  }

  if (!event.data || !calendars.data || exceptionPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingHeader}>
          <HeaderButton icon="chevron-back" label="뒤로가기" onPress={() => router.back()} />
        </View>
        <Content style={styles.empty}>
          <Txt variant="body" tone="secondary">
            {event.isError || exception.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
          </Txt>
        </Content>
      </Screen>
    );
  }

  const master = event.data;
  const patch = exception.data?.type === 'MODIFIED' ? exception.data : null;
  const effective = occurrenceTime(master, occ, patch);
  const calendar = calendars.data.find((item) => item.id === master.calendar_id);
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
      : '알림 없음';

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
            <Txt variant="display" tone="accent" style={styles.title}>
              {title}
            </Txt>
            <TimeHero event={effective} />
          </View>

          <View style={[styles.details, { borderColor: colors.border }]}>
            <DetailRow icon="alarm-outline" label={reminderLabel} />
            <DetailRow
              icon="calendar-outline"
              label={calendar?.name ?? master.calendarName}
              imageUrl={calendar?.coverUrl}
            />
            {location ? <DetailRow icon="location-outline" label={location} /> : null}
            {description ? <DetailRow icon="document-text-outline" label={description} /> : null}
          </View>

          <View style={styles.activity}>
            <View style={styles.dateDivider}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <Txt variant="label" tone="tertiary">
                {formatActivityDate(master.created_at)}
              </Txt>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
            </View>
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
      <View style={styles.allDayTime}>
        <Txt variant="title">{formatFullDate(start)}</Txt>
        {event.start_date !== event.end_date ? (
          <>
            <Ionicons name="chevron-forward" size={28} color={colors.accent} />
            <Txt variant="title">{formatFullDate(end)}</Txt>
          </>
        ) : null}
        <Txt variant="body" tone="secondary">
          종일
        </Txt>
      </View>
    );
  }

  const start = new Date(event.start_at!);
  const end = new Date(event.end_at!);

  return (
    <View style={styles.timeRange}>
      <TimeColumn date={start} />
      <Ionicons
        name="chevron-forward"
        size={34}
        color={colors.accent}
        style={styles.timeArrow}
      />
      <TimeColumn date={end} />
    </View>
  );
}

function TimeColumn({ date }: { date: Date }) {
  const [meridiem, clock] = formatTime(date).split(' ');
  return (
    <View style={styles.timeColumn}>
      <Txt variant="subtitle">{formatFullDate(date)}</Txt>
      <View style={styles.clockRow}>
        <Txt variant="body">{meridiem}</Txt>
        <Txt variant="hero">{clock}</Txt>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  imageUrl,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  imageUrl?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={24} color={colors.accent} />
      <Txt variant="subtitle" style={styles.detailLabel} numberOfLines={3}>
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

/**
 * 반복 일정 마스터의 시간 컬럼을 사용자가 누른 회차의 시각으로 바꾼다.
 * 이 회차만 수정한 예외가 있으면 그 값이 가장 우선한다.
 */
function occurrenceTime<T extends TimeShape>(
  master: T,
  occ: string | undefined,
  patch?: { [K in keyof TimeShape]?: TimeShape[K] | null } | null,
): T {
  if (patch) {
    const allDay = patch.is_all_day ?? master.is_all_day;
    if (allDay && patch.start_date) {
      return {
        ...master,
        is_all_day: true,
        start_at: null,
        end_at: null,
        start_date: patch.start_date,
        end_date: patch.end_date ?? patch.start_date,
      };
    }
    if (!allDay && patch.start_at) {
      return {
        ...master,
        is_all_day: false,
        start_date: null,
        end_date: null,
        start_at: patch.start_at,
        end_at: patch.end_at ?? patch.start_at,
      };
    }
  }

  if (!occ) return master;

  const start = new Date(occ);
  if (Number.isNaN(start.getTime())) return master;

  if (master.is_all_day) {
    const days =
      (new Date(master.end_date!).getTime() - new Date(master.start_date!).getTime()) / 86_400_000;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const key = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    return { ...master, start_date: key(start), end_date: key(end) };
  }

  const span = new Date(master.end_at!).getTime() - new Date(master.start_at!).getTime();
  return {
    ...master,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + span).toISOString(),
  };
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
    alignItems: 'center',
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  title: { textAlign: 'center' },
  timeRange: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  timeColumn: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  timeArrow: { opacity: 0.75 },
  allDayTime: { alignItems: 'center', gap: Spacing.sm },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  detailLabel: { flex: 1 },
  calendarThumb: { width: 38, height: 38, borderRadius: Radius.sm },
  activity: {
    minHeight: 190,
    alignItems: 'center',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
  },
  dateDivider: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  activityLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tools: { paddingHorizontal: Spacing.lg },
});
