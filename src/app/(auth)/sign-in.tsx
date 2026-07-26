import * as AppleAuthentication from 'expo-apple-authentication';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  SignInCancelledError,
  isAppleSignInSupported,
  signInWithApple,
  signInWithGoogle,
} from '@/features/auth/oauth';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured } from '@/lib/env';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { signInWithEmail, signUpWithEmail } = useAuth();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [pending, setPending] = useState<null | 'email' | 'google' | 'apple'>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const busy = pending !== null;
  const disabled = busy || !isSupabaseConfigured;

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

  function submitEmail() {
    if (!email.trim() || !password) {
      setMessage({ tone: 'error', text: '이메일과 비밀번호를 입력해 주세요' });
      return;
    }
    if (mode === 'sign-up' && !nickname.trim()) {
      setMessage({ tone: 'error', text: '닉네임을 입력해 주세요' });
      return;
    }

    void run('email', async () => {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password);
        return;
      }
      const result = await signUpWithEmail(email, password, nickname);
      if (result.status === 'confirmation-sent') {
        setMessage({
          tone: 'info',
          text: '확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해 주세요.',
        });
      }
    });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={styles.header}>
            <ThemedText type="subtitle">함께캘린더</ThemedText>
            <ThemedText themeColor="textSecondary">
              가족·연인·친구와 하나의 캘린더를 공유하세요
            </ThemedText>
          </View>

          {!isSupabaseConfigured && (
            <View style={[styles.banner, { borderColor: theme.danger }]}>
              <ThemedText type="smallBold" themeColor="danger">
                Supabase 설정이 필요합니다
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                프로젝트 루트에 `.env`를 만들고 EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY 를 채운 뒤 개발
                서버를 다시 시작하세요. (`.env.example` 참고)
              </ThemedText>
            </View>
          )}

          <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
            {(['sign-in', 'sign-up'] as const).map((value) => (
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
                  {value === 'sign-in' ? '로그인' : '회원가입'}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={styles.form}>
            {mode === 'sign-up' && (
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
              placeholder={mode === 'sign-up' ? '6자 이상' : ''}
              autoCapitalize="none"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              secureTextEntry
              onSubmitEditing={submitEmail}
              returnKeyType="go"
            />
          </View>

          {message && (
            <ThemedText
              type="small"
              themeColor={message.tone === 'error' ? 'danger' : 'textSecondary'}>
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
                {mode === 'sign-in' ? '로그인' : '가입하기'}
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
            onPress={() => run('google', async () => void (await signInWithGoogle()))}
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

          {isAppleSignInSupported && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={() => run('apple', async () => void (await signInWithApple()))}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

  // Supabase가 돌려주는 영어 메시지 중 자주 보는 것만 다듬는다
  if (/invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (/user already registered/i.test(raw)) return '이미 가입된 이메일입니다';
  if (/password should be at least/i.test(raw)) return '비밀번호는 6자 이상이어야 합니다';
  if (/email not confirmed/i.test(raw)) return '이메일 확인이 아직 완료되지 않았습니다';
  if (/network request failed/i.test(raw)) return '네트워크에 연결할 수 없습니다';
  return raw;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  banner: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  segment: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: 10,
    gap: Spacing.one,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
