import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { MonthView } from '@/features/calendar/month-view';
import { useMyCalendars } from '@/features/calendars/queries';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, formatDayTitle, startOfMonth } from '@/lib/date';
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
            />
          </Card>

          {hasCalendars ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Txt variant="subtitle">{formatDayTitle(selected)}</Txt>
                <Txt variant="caption" tone="tertiary">
                  일정 0개
                </Txt>
              </View>

              <Card flat>
                <EmptyState
                  compact
                  icon="sunny-outline"
                  title="이 날은 비어 있어요"
                  description="일정 추가는 3단계에서 붙습니다."
                />
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
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
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
