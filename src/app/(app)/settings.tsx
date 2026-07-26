import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content, Header, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, isGuest, signOut } = useAuth();
  const profile = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      Alert.alert('로그아웃 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content>
          <Header title="설정" />

          <View style={styles.group}>
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
                    {isGuest ? '게스트 · 이 기기에서만 사용 중' : (user?.email ?? '이메일 없음')}
                  </Txt>
                </View>
              </View>

              {isGuest ? (
                <View style={styles.upgrade}>
                  <Txt variant="caption" tone="secondary">
                    계정을 만들면 다른 기기에서도 이어서 쓰고, 캘린더를 다른 사람과 공유할 수
                    있습니다. 지금까지 쓰던 내용은 그대로 유지됩니다.
                  </Txt>
                  <Button label="계정 만들기" onPress={() => router.push('/account')} />
                </View>
              ) : null}
            </Card>
          </View>

          <Section title="알림">
            <Card padded={false}>
              <ListRow
                icon="notifications-outline"
                title="푸시 알림"
                subtitle="일정 등록·변경, 댓글, 리마인더"
                value="6단계"
                disabled
              />
            </Card>
          </Section>

          <Section title="연동">
            <Card padded={false}>
              <ListRow
                icon="sync-outline"
                title="다른 캘린더 가져오기"
                subtitle="Google · Apple · 네이버"
                value="예정"
                disabled
              />
            </Card>
          </Section>

          <Section title="계정">
            <Card padded={false}>
              {isGuest ? (
                <ListRow
                  icon="log-in-outline"
                  title="이미 계정이 있어요"
                  subtitle="기존 계정으로 로그인"
                  onPress={() => router.push('/account')}
                />
              ) : (
                <>
                  <ListRow
                    icon="person-outline"
                    title="프로필 수정"
                    value="예정"
                    disabled
                  />
                  <Divider />
                  <ListRow
                    icon="log-out-outline"
                    title={signingOut ? '로그아웃 중…' : '로그아웃'}
                    danger
                    onPress={handleSignOut}
                    disabled={signingOut}
                  />
                </>
              )}
            </Card>
          </Section>

          <Txt variant="caption" tone="tertiary" style={styles.footnote}>
            계정 삭제는 스토어 심사 필수 요건이라 8단계에서 붙습니다.
          </Txt>
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
  scroll: { paddingBottom: Spacing.xxxl },
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
  upgrade: { gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  footnote: { paddingHorizontal: Spacing.xl },
});
