import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { TIME_PICKER_STYLE_LABELS } from '@/features/events/time-picker-style';
import { deviceWidgetsSupported } from '@/features/widgets/widget-capability';
import { lockScreenBoardSupported } from '@/features/wallpaper/capability';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/lib/confirm';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
import { useThemePreference } from '@/stores/theme-preference';
import { useTimePickerPreference } from '@/stores/time-picker-preference';

const THEME_NAMES = { apricot: '살구', indigo: '쪽빛', ink: '먹빛' } as const;

export default function PreferencesScreen() {
  const { colors } = useTheme();
  const { isGuest, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const deviceCalendarsConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendars = useDeviceCalendarPreference((state) => state.selectedIds.length);
  const theme = useThemePreference((state) => state.theme);
  const timePickerStyle = useTimePickerPreference((state) => state.style);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      notify('로그아웃 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <Section title="캘린더와 일정">
          <Card padded={false}>
            <ListRow
              icon="calendar-outline"
              title="캘린더 표시"
              subtitle="주 시작일·음력·주 번호·시간대"
              onPress={() => router.push('/calendar-display-settings' as Href)}
            />
            <Divider inset="icon" />
            <ListRow
              icon="link-outline"
              title="기기 캘린더 연결"
              subtitle="iCloud·Google·구독 캘린더를 읽기 전용으로 표시"
              value={deviceCalendarsConnected ? `${selectedDeviceCalendars}개 표시` : '연결 안 됨'}
              onPress={() => router.push('/external-calendars')}
            />
            {Platform.OS === 'ios' ? (
              <>
                <Divider inset="icon" />
                <ListRow
                  icon="time-outline"
                  title="시간 선택 방식"
                  value={TIME_PICKER_STYLE_LABELS[timePickerStyle]}
                  onPress={() => router.push('/time-picker-lab' as Href)}
                />
              </>
            ) : null}
          </Card>
        </Section>

        <Section title="알림">
          <Card padded={false}>
            <ListRow
              icon="notifications-outline"
              title="앱 알림"
              subtitle="알림 허용 상태와 캘린더별 음소거"
              onPress={() => router.push('/notifications')}
            />
          </Card>
        </Section>

        {deviceWidgetsSupported ? (
          <Section title="홈 화면과 잠금화면">
            <Card padded={false}>
              <ListRow
                icon="apps-outline"
                title="위젯"
                subtitle="홈 화면·잠금화면 위젯에 표시할 캘린더"
                onPress={() => router.push('/widget-settings' as Href)}
              />
              {lockScreenBoardSupported ? (
                <>
                  <Divider inset="icon" />
                  <ListRow
                    icon="phone-portrait-outline"
                    title="잠금화면 배경화면"
                    subtitle="일정 보드·배경 사진·자동 갱신 설정"
                    onPress={() => router.push('/lock-screen-board' as Href)}
                  />
                </>
              ) : null}
            </Card>
          </Section>
        ) : null}

        <Section title="화면 꾸미기">
          <Card padded={false}>
            <ListRow
              icon="color-palette-outline"
              title="테마와 글자"
              subtitle="앱 색·라이트/다크 모드·폰트"
              value={THEME_NAMES[theme]}
              onPress={() => router.push('/appearance-settings' as Href)}
            />
          </Card>
        </Section>

        <Section title="계정">
          <Card padded={false}>
            {isGuest ? (
              <>
                <ListRow
                  icon="person-add-outline"
                  title="계정 만들기"
                  subtitle="재설치·기기 변경에도 현재 데이터 보존"
                  onPress={() => router.push('/account')}
                />
                <Divider inset="icon" />
                <ListRow
                  icon="log-in-outline"
                  title="이미 계정이 있어요"
                  subtitle="재설치·기기 변경 후 데이터 불러오기"
                  onPress={() => router.push({ pathname: '/account', params: { mode: 'sign-in' } })}
                />
              </>
            ) : (
              <ListRow
                icon="log-out-outline"
                title={signingOut ? '로그아웃 중…' : '로그아웃'}
                danger
                disabled={signingOut}
                onPress={handleSignOut}
              />
            )}
            <Divider inset="icon" />
            <ListRow
              icon="trash-outline"
              title="계정 삭제"
              subtitle="되돌릴 수 없습니다"
              danger
              onPress={() => router.push('/account-delete')}
            />
          </Card>
        </Section>
      </Content>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>{title}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
});
