import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import {
  SignInCancelledError,
  isNativeAppleSignInSupported,
  linkOAuthAccount,
  signInWithAppleNative,
  signInWithOAuth,
} from '@/features/auth/oauth';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured } from '@/lib/env';

type Mode = 'create' | 'sign-in';

const MODES = [
  { value: 'create' as const, label: '계정 만들기' },
  { value: 'sign-in' as const, label: '로그인' },
];

/**
 * 가입/로그인 화면. 시작 화면이 아니라 **필요할 때 여는 모달**이다.
 * 게스트로 쓰던 사람이 여기서 계정을 만들면 쓰던 데이터를 그대로 들고 간다.
 */
export default function AccountScreen() {
  const { colors, scheme } = useTheme();
  const { isGuest, bootstrapError, createAccount, signInWithEmail } = useAuth();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [pending, setPending] = useState<null | 'email' | 'google' | 'apple'>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const busy = pending !== null;
  const disabled = busy || !isSupabaseConfigured;
  const creating = mode === 'create';

  async function run(kind: NonNullable<typeof pending>, action: () => Promise<void>) {
    setMessage(null);
    setPending(kind);
    try {
      await action();
    } catch (e) {
      if (e instanceof SignInCancelledError) return;
      setMessage({ tone: 'error', text: toMessage(e) });
    } finally {
      setPending(null);
    }
  }

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function submitEmail() {
    if (!email.trim() || !password) {
      setMessage({ tone: 'error', text: '이메일과 비밀번호를 입력해 주세요' });
      return;
    }
    if (creating && !nickname.trim()) {
      setMessage({ tone: 'error', text: '닉네임을 입력해 주세요' });
      return;
    }

    void run('email', async () => {
      if (!creating) {
        await signInWithEmail(email, password);
        done();
        return;
      }
      const result = await createAccount(email, password, nickname);
      if (result.status === 'confirmation-sent') {
        setMessage({
          tone: 'info',
          text: '확인 메일을 보냈습니다. 메일의 링크를 눌러야 계정이 완성됩니다.',
        });
        return;
      }
      done();
    });
  }

  /** 게스트면 연결(데이터 유지), 아니면 일반 로그인 */
  function socialAction(provider: 'google' | 'apple') {
    return async () => {
      if (creating && isGuest) await linkOAuthAccount(provider);
      else if (provider === 'apple' && isNativeAppleSignInSupported) await signInWithAppleNative();
      else await signInWithOAuth(provider);
      done();
    };
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Content style={styles.content}>
          <View style={styles.intro}>
            <Txt variant="display">{creating ? '계정 만들기' : '로그인'}</Txt>
            <Txt variant="body" tone="secondary">
              {reason ??
                (creating
                  ? '지금까지 쓰던 내용은 그대로 유지됩니다.'
                  : '다른 기기에서 쓰던 계정으로 이어서 사용합니다.')}
            </Txt>
          </View>

          {!isSupabaseConfigured && (
            <Notice tone="danger" title="Supabase 설정이 필요합니다">
              프로젝트 루트에 .env를 만들고 EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY 를 채운 뒤 개발
              서버를 다시 시작하세요.
            </Notice>
          )}

          {bootstrapError && (
            <Notice tone="danger" title="게스트로 시작할 수 없습니다">
              Supabase 프로젝트에서 익명 로그인을 켜야 가입 없이 쓸 수 있습니다. 우선은 계정을
              만들어 주세요.
            </Notice>
          )}

          {!creating && isGuest && (
            <Notice tone="danger" title="게스트 기록은 넘어가지 않습니다">
              지금 기기에서 만든 내용은 다른 계정으로 로그인하면 사라집니다. 지금 것을 계속 쓰려면
              계정 만들기 쪽을 선택하세요.
            </Notice>
          )}

          <Segmented
            options={MODES}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setMessage(null);
            }}
          />

          <View style={styles.form}>
            {creating && (
              <Field
                label="닉네임"
                value={nickname}
                onChangeText={setNickname}
                placeholder="구성원에게 보이는 이름"
                autoCapitalize="none"
                maxLength={20}
              />
            )}

            <Field
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
            />

            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder={creating ? '6자 이상' : ''}
              hint={creating ? '6자 이상 입력해 주세요' : undefined}
              autoCapitalize="none"
              autoComplete={creating ? 'new-password' : 'current-password'}
              secureTextEntry
              onSubmitEditing={submitEmail}
              returnKeyType="go"
            />
          </View>

          {message && (
            <Txt variant="caption" tone={message.tone === 'error' ? 'danger' : 'secondary'}>
              {message.text}
            </Txt>
          )}

          <Button
            label={creating ? '계정 만들기' : '로그인'}
            loading={pending === 'email'}
            disabled={disabled}
            onPress={submitEmail}
          />

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Txt variant="caption" tone="tertiary">
              또는
            </Txt>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <Button
            label="Google로 계속하기"
            variant="secondary"
            loading={pending === 'google'}
            disabled={disabled}
            onPress={() => run('google', socialAction('google'))}
          />

          {isNativeAppleSignInSupported && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={Radius.md}
              style={styles.appleButton}
              onPress={() => run('apple', socialAction('apple'))}
            />
          )}

          {isGuest ? (
            <Pressable accessibilityRole="button" onPress={done} style={styles.later}>
              <Txt variant="label" tone="tertiary">
                나중에 하기
              </Txt>
            </Pressable>
          ) : null}
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);

  if (/invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (/already been registered|already registered|already exists/i.test(raw))
    return '이미 가입된 이메일입니다. 로그인 쪽으로 이어서 사용하세요.';
  if (/password should be at least/i.test(raw)) return '비밀번호는 6자 이상이어야 합니다';
  if (/email not confirmed/i.test(raw)) return '이메일 확인이 아직 완료되지 않았습니다';
  if (/manual linking is disabled/i.test(raw))
    return 'Supabase에서 Manual Linking을 켜야 소셜 계정을 연결할 수 있습니다';
  if (/network request failed/i.test(raw)) return '네트워크에 연결할 수 없습니다';
  return raw;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // 세로 가운데 정렬은 쓰지 않는다. 폼이 화면보다 길어지면 위쪽에 빈 공간이 생기고
  // 내용이 아래로 밀린다.
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs, marginBottom: Spacing.xs },
  form: { gap: Spacing.lg },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  appleButton: { height: 52 },
  later: { alignSelf: 'center', padding: Spacing.md },
});
