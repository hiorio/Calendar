import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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

/**
 * 가입/로그인 화면. 시작 화면이 아니라 **필요할 때 여는 모달**이다.
 * 게스트로 쓰던 사람이 여기서 계정을 만들면 쓰던 데이터를 그대로 들고 간다.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { isGuest, user, bootstrapError, createAccount, signInWithEmail } = useAuth();
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
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <ThemedText type="subtitle">{creating ? '계정 만들기' : '로그인'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {reason ??
              (creating
                ? '지금까지 쓰던 내용은 그대로 유지됩니다.'
                : '다른 기기에서 쓰던 계정으로 이어서 사용합니다.')}
          </ThemedText>
        </View>

        {!isSupabaseConfigured && (
          <Notice tone="danger" title="Supabase 설정이 필요합니다">
            프로젝트 루트에 `.env`를 만들고 EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY 를 채운 뒤 개발
            서버를 다시 시작하세요. (`.env.example` 참고)
          </Notice>
        )}

        {bootstrapError && (
          <Notice tone="danger" title="게스트로 시작할 수 없습니다">
            Supabase 프로젝트에서 익명 로그인(Anonymous sign-ins)을 켜야 가입 없이 쓸 수 있습니다.
            우선은 계정을 만들어 주세요.
          </Notice>
        )}

        {!creating && isGuest && (
          <Notice tone="warn" title="게스트 기록은 넘어가지 않습니다">
            지금 기기에서 만든 내용은 다른 계정으로 로그인하면 사라집니다. 지금 것을 계속 쓰려면
            {' 계정 만들기 '}
            쪽을 선택하세요.
          </Notice>
        )}

        <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
          {(
            [
              ['create', '계정 만들기'],
              ['sign-in', '로그인'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === value }}
              onPress={() => {
                setMode(value);
                setMessage(null);
              }}
              style={[
                styles.segmentItem,
                mode === value && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="smallBold" themeColor={mode === value ? 'text' : 'textSecondary'}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

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
            autoCapitalize="none"
            autoComplete={creating ? 'new-password' : 'current-password'}
            secureTextEntry
            onSubmitEditing={submitEmail}
            returnKeyType="go"
          />
        </View>

        {message && (
          <ThemedText type="small" themeColor={message.tone === 'error' ? 'danger' : 'textSecondary'}>
            {message.text}
          </ThemedText>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={submitEmail}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.tint, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
          ]}>
          {pending === 'email' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              {creating ? '계정 만들기' : '로그인'}
            </ThemedText>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <ThemedText type="small" themeColor="textSecondary">
            또는
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => run('google', socialAction('google'))}
          style={({ pressed }) => [
            styles.socialButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.background,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          {pending === 'google' ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <ThemedText type="smallBold">Google로 계속하기</ThemedText>
          )}
        </Pressable>

        {isNativeAppleSignInSupported && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={12}
            style={styles.appleButton}
            onPress={() => run('apple', socialAction('apple'))}
          />
        )}

        {isGuest && user && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            지금은 이 기기에서만 쓰는 게스트 상태입니다. 앱을 지우면 기록도 사라집니다.
          </ThemedText>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'danger' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.danger : theme.tint;

  return (
    <View style={[styles.notice, { borderColor: color }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {children}
      </ThemedText>
    </View>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function Field({ label, style, ...rest }: FieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

function toMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);

  if (/invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (/already been registered|already registered|already exists/i.test(raw))
    return '이미 가입된 이메일입니다. "로그인"으로 이어서 사용하세요.';
  if (/password should be at least/i.test(raw)) return '비밀번호는 6자 이상이어야 합니다';
  if (/email not confirmed/i.test(raw)) return '이메일 확인이 아직 완료되지 않았습니다';
  if (/manual linking is disabled/i.test(raw))
    return 'Supabase에서 Manual Linking을 켜야 소셜 계정을 연결할 수 있습니다';
  if (/network request failed/i.test(raw)) return '네트워크에 연결할 수 없습니다';
  return raw;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  notice: { gap: Spacing.one, padding: Spacing.three, borderRadius: 12, borderWidth: 1 },
  segment: { flexDirection: 'row', padding: Spacing.one, borderRadius: 10, gap: Spacing.one },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 8 },
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  primaryButton: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: '#ffffff' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  socialButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButton: { height: 50 },
  footnote: { textAlign: 'center' },
});
