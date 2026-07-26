import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const theme = useTheme();
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ThemedText type="subtitle">설정</ThemedText>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {profile.isPending ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <>
              <ThemedText type="smallBold">{profile.data?.nickname ?? '알 수 없는 사용자'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isGuest ? '게스트 — 이 기기에서만 사용 중' : (user?.email ?? '이메일 없음')}
              </ThemedText>
            </>
          )}
        </View>

        {isGuest ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              계정을 만들면 다른 기기에서도 이어서 쓰고, 캘린더를 다른 사람과 공유할 수 있습니다.
              지금까지 쓰던 내용은 그대로 유지됩니다.
            </ThemedText>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                계정 만들기
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={signingOut}
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.button,
              styles.outlined,
              { borderColor: theme.border, opacity: signingOut ? 0.5 : pressed ? 0.85 : 1 },
            ]}>
            {signingOut ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <ThemedText type="smallBold" themeColor="danger">
                로그아웃
              </ThemedText>
            )}
          </Pressable>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          프로필 수정, 알림 설정, 계정 삭제는 이후 단계에서 붙습니다.
          {'\n'}계정 삭제는 스토어 심사 필수 요건입니다 (8단계).
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, gap: Spacing.three, padding: Spacing.four },
  card: { gap: Spacing.one, padding: Spacing.three, borderRadius: 12 },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outlined: { borderWidth: 1 },
  primaryLabel: { color: '#ffffff' },
  note: { marginTop: 'auto' },
});
