import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content, Header, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import {
  activityIcon,
  describeActivity,
  useActivity,
  type ActivityEntry,
} from '@/features/activity/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatDayTitle, toDateKey } from '@/lib/date';
import { formatTime } from '@/lib/event-time';
import { useCalendarFilter } from '@/stores/calendar-filter';

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { hidden } = useCalendarFilter();
  const activity = useActivity();

  // 캘린더 화면에서 숨긴 캘린더는 여기서도 빼 준다. 두 화면이 다른 것을 보여 주면
  // "왜 없지?" 하게 된다.
  const entries = useMemo(
    () =>
      (activity.data?.pages.flat() ?? []).filter((entry) => !hidden.includes(entry.calendar_id)),
    [activity.data, hidden],
  );

  // 날짜별로 묶는다. 하루치가 한 덩어리로 보여야 훑기 좋다.
  const days = useMemo(() => {
    const groups: { key: string; label: string; items: ActivityEntry[] }[] = [];
    for (const entry of entries) {
      const date = new Date(entry.created_at);
      const key = toDateKey(date);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(entry);
      else groups.push({ key, label: formatDayTitle(date), items: [entry] });
    }
    return groups;
  }, [entries]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <Header title="활동" subtitle="누가 무엇을 바꿨는지 모아 봅니다" />

          {activity.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}

          {activity.isError ? (
            <View style={styles.section}>
              <Txt variant="caption" tone="danger">
                활동을 불러오지 못했습니다: {(activity.error as Error).message}
              </Txt>
            </View>
          ) : null}

          {!activity.isLoading && days.length === 0 ? (
            <View style={styles.section}>
              <Card>
                <EmptyState
                  icon="pulse-outline"
                  title="아직 소식이 없어요"
                  description={'일정을 추가하거나 댓글을 남기면\n여기에 시간순으로 쌓입니다.'}
                />
              </Card>
            </View>
          ) : null}

          {days.map((day) => (
            <View key={day.key} style={styles.section}>
              <Txt variant="label" tone="secondary">
                {day.label}
              </Txt>

              <Card flat padded={false}>
                {day.items.map((entry, index) => (
                  <View key={entry.id}>
                    {index > 0 ? <Divider /> : null}
                    <ActivityRow entry={entry} />
                  </View>
                ))}
              </Card>
            </View>
          ))}

          {activity.hasNextPage ? (
            <View style={styles.section}>
              <Button
                label="더 보기"
                variant="secondary"
                loading={activity.isFetchingNextPage}
                onPress={() => activity.fetchNextPage()}
              />
            </View>
          ) : null}
        </Content>
      </ScrollView>
    </Screen>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { colors } = useTheme();
  const { text, detail } = describeActivity(entry);

  // 삭제된 일정으로는 갈 수 없다
  const openable =
    entry.ref_id !== null &&
    (entry.type === 'EVENT_CREATED' ||
      entry.type === 'EVENT_UPDATED' ||
      entry.type === 'COMMENT_CREATED');

  const row = (
    <>
      <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons
          name={activityIcon(entry.type) as React.ComponentProps<typeof Ionicons>['name']}
          size={16}
          color={colors.textSecondary}
        />
      </View>

      <View style={styles.body}>
        <Txt variant="body">{text}</Txt>
        {detail ? (
          <Txt variant="caption" tone="secondary" numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: entry.calendarColor }]} />
          <Txt variant="caption" tone="tertiary">
            {entry.calendarName} · {formatTime(new Date(entry.created_at))}
          </Txt>
        </View>
      </View>

      {openable ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </>
  );

  if (!openable) return <View style={styles.row}>{row}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text} 열기`}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: entry.ref_id! } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
      ]}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xxxl * 2 },
  section: { gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  center: { paddingTop: Spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingTop: 1 },
  dot: { width: 7, height: 7, borderRadius: Radius.pill },
});
