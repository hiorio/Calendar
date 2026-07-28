import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content, Header, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
import { useThemePreference } from '@/stores/theme-preference';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SHORTCUTS: { title: string; icon: IconName; href: Href }[] = [
  { title: '메모', icon: 'document-text-outline', href: '/memos' },
  { title: '검색', icon: 'search-outline', href: '/search' },
  { title: '설정', icon: 'settings-outline', href: '/preferences' },
  { title: '알림', icon: 'notifications-outline', href: '/notifications' },
  { title: '활동', icon: 'pulse-outline', href: '/activity' },
  { title: '캘린더 관리', icon: 'calendar-outline', href: '/calendars' },
];

const THEME_LABELS = { apricot: '살구', indigo: '쪽빛', ink: '먹빛' } as const;

export default function MoreScreen() {
  const { colors } = useTheme();
  const { isGuest } = useAuth();
  const profile = useProfile();
  const theme = useThemePreference((state) => state.theme);
  const deviceCalendarsConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendars = useDeviceCalendarPreference((state) => state.selectedIds.length);
  const { weekStart, showWeekNumbers, showLunar } = useCalendarPreference();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <Header title="더보기" />

          <View style={styles.group}>
            <Card style={styles.brandCard}>
              <View style={[styles.brandMark, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="git-branch-outline" size={28} color={colors.accent} />
              </View>
              <View style={styles.brandText}>
                <Txt variant="subtitle">일정과 기록을 한 흐름으로</Txt>
                <Txt variant="caption" tone="secondary">
                  TimeLine의 설정과 부가 기능을 여기에서 관리합니다.
                </Txt>
              </View>
            </Card>
          </View>

          <View style={styles.group}>
            <Card padded={false} style={styles.shortcutGrid}>
              {SHORTCUTS.map((shortcut) => (
                <Pressable
                  key={shortcut.title}
                  accessibilityRole="button"
                  accessibilityLabel={shortcut.title}
                  onPress={() => router.push(shortcut.href)}
                  style={({ pressed }) => [
                    styles.shortcut,
                    {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                    },
                  ]}>
                  <Ionicons name={shortcut.icon} size={25} color={colors.accent} />
                  <Txt variant="label">{shortcut.title}</Txt>
                </Pressable>
              ))}
            </Card>
          </View>

          <Section title="계정">
            <Card padded={false}>
              <View style={styles.identity}>
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  {profile.isPending ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Txt variant="title" tone="onAccent">
                      {profile.data?.nickname?.slice(0, 1) ?? '·'}
                    </Txt>
                  )}
                </View>
                <View style={styles.identityText}>
                  <Txt variant="subtitle">{profile.data?.nickname ?? '알 수 없는 사용자'}</Txt>
                  <Txt variant="caption" tone="secondary">
                    {isGuest ? '게스트 · 이 기기에서 사용 중' : '계정으로 동기화 중'}
                  </Txt>
                </View>
              </View>
              <Divider />
              {isGuest ? (
                <View style={styles.accountAction}>
                  <Txt variant="caption" tone="secondary">
                    계정을 만들면 다른 기기에서 이어 쓰고 캘린더를 공유할 수 있습니다.
                  </Txt>
                  <Button label="계정 만들기" size="md" onPress={() => router.push('/account')} />
                </View>
              ) : (
                <ListRow
                  title="계정 관리"
                  icon="person-outline"
                  onPress={() => router.push('/preferences')}
                />
              )}
            </Card>
          </Section>

          <Section title="캘린더 설정">
            <Card padded={false}>
              <ListRow
                title="한 주의 시작"
                value={weekStart === 'sunday' ? '일요일' : '월요일'}
                onPress={() => router.push('/preferences')}
              />
              <Divider />
              <ListRow
                title="주 번호"
                value={showWeekNumbers ? '표시' : '숨김'}
                onPress={() => router.push('/preferences')}
              />
              <Divider />
              <ListRow
                title="음력"
                value={showLunar ? '표시' : '숨김'}
                onPress={() => router.push('/preferences')}
              />
              <Divider />
              <ListRow
                title="화면 테마"
                value={THEME_LABELS[theme]}
                onPress={() => router.push('/preferences')}
              />
              <Divider />
              <ListRow
                title="외부 캘린더"
                value={
                  deviceCalendarsConnected ? `${selectedDeviceCalendars}개 표시` : '연결 안 됨'
                }
                onPress={() => router.push('/external-calendars')}
              />
            </Card>
          </Section>
        </Content>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xxxl * 2 },
  group: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  brandCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1, gap: Spacing.xs },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  shortcut: {
    width: '33.333%',
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 2 },
  accountAction: { gap: Spacing.md, padding: Spacing.lg },
});
