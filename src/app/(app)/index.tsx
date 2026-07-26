import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { MonthView } from '@/features/calendar/month-view';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, formatDayTitle, startOfMonth } from '@/lib/date';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { isGuest } = useAuth();
  const profile = useProfile();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());

  const calendars = useQuery({
    queryKey: ['calendars', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendars')
        .select('id, name, color')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <View style={styles.topBar}>
            <View>
              <Txt variant="caption" tone="tertiary">
                {profile.data ? `${profile.data.nickname}님의 캘린더` : '캘린더'}
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

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Txt variant="subtitle">{formatDayTitle(selected)}</Txt>
              <Txt variant="caption" tone="tertiary">
                일정 {0}개
              </Txt>
            </View>

            <Card flat>
              <EmptyState
                compact
                icon="sunny-outline"
                title="이 날은 비어 있어요"
                description={
                  calendars.data?.length
                    ? '아래 ＋ 에서 일정을 추가할 수 있습니다 (3단계).'
                    : '캘린더를 만들면 여기에 일정이 쌓입니다 (2단계).'
                }
              />
            </Card>
          </View>

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
            <Txt variant="caption" tone="danger">
              캘린더를 불러오지 못했습니다: {(calendars.error as Error).message}
            </Txt>
          ) : null}
        </Content>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xxxl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
