import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content, Header, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
import { useThemePreference } from '@/stores/theme-preference';

const THEME_LABELS = { apricot: '살구', indigo: '쪽빛', ink: '먹빛' } as const;
const FONT_SIZE_LABELS = {
  small: '작게',
  standard: '보통',
  large: '크게',
  extraLarge: '매우 크게',
} as const;
const FONT_FAMILY_LABELS = {
  system: '기본',
  nanumGothic: '나눔고딕',
  nanumMyeongjo: '나눔명조',
} as const;
export default function MoreScreen() {
  const { colors } = useTheme();
  const { isGuest } = useAuth();
  const profile = useProfile();
  const theme = useThemePreference((state) => state.theme);
  const fontSizePreference = useThemePreference((state) => state.fontSizePreference);
  const fontFamilyPreference = useThemePreference((state) => state.fontFamilyPreference);
  const deviceCalendarsConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendars = useDeviceCalendarPreference((state) => state.selectedIds.length);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <Header title="더보기" />

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
                    가입 없이도 앱을 사용할 수 있어요. 재설치하거나 기기를 바꿔도 데이터를 이어서
                    쓰려면 계정을 만들어 주세요.
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

          <Section title="캘린더">
            <Card padded={false}>
              <ListRow
                title="캘린더 관리"
                subtitle="공유 캘린더와 구성원 관리"
                icon="calendar-outline"
                onPress={() => router.push('/calendars')}
              />
              <Divider inset="icon" />
              <ListRow
                title="알림"
                subtitle="이 기기와 캘린더별 알림 설정"
                icon="notifications-outline"
                onPress={() => router.push('/notifications')}
              />
              <Divider inset="icon" />
              <ListRow
                title="외부 캘린더"
                subtitle="iCloud·Google·구독 캘린더"
                icon="link-outline"
                value={
                  deviceCalendarsConnected ? `${selectedDeviceCalendars}개 표시` : '연결 안 됨'
                }
                onPress={() => router.push('/external-calendars')}
              />
            </Card>
          </Section>

          <Section title="도구">
            <Card padded={false}>
              <ListRow
                title="검색"
                subtitle="일정과 메모 찾기"
                icon="search-outline"
                onPress={() => router.push('/search')}
              />
              <Divider inset="icon" />
              <ListRow
                title="메모"
                subtitle="캘린더 구성원과 공유하는 기록"
                icon="document-text-outline"
                onPress={() => router.push('/memos')}
              />
            </Card>
          </Section>

          <Section title="앱">
            <Card padded={false}>
              <ListRow
                title="설정"
                subtitle="표시·입력·위젯·계정"
                icon="settings-outline"
                value={`${THEME_LABELS[theme]} · ${FONT_FAMILY_LABELS[fontFamilyPreference]} ${FONT_SIZE_LABELS[fontSizePreference]}`}
                onPress={() => router.push('/preferences')}
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
