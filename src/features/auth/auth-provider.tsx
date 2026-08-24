import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { SOCIAL_AUTH_ENABLED } from '@/constants/features';
import {
  isNativeAppleSignInSupported,
  linkAppleNative,
  linkOAuthAccount,
  signInWithAppleNative,
  signInWithOAuth,
  type OAuthProvider,
} from '@/features/auth/oauth';
import {
  isNativeGoogleSignInSupported,
  linkGoogleNative,
  signInWithGoogleNative,
} from '@/features/auth/google-native';
import {
  claimPendingGuestDataTransfer,
  discardPendingGuestDataTransfer,
  prepareGuestDataTransfer,
} from '@/features/auth/guest-data-transfer';
import { clearHomeSnapshotCache } from '@/features/calendar/home-snapshot';
import {
  unregisterPush,
  withPushDetachedForAccountSwitch,
} from '@/features/notifications/push';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** 세션 부트스트랩이 끝나기 전에는 라우팅을 결정하면 안 된다 */
  isLoading: boolean;
  /** 익명(게스트) 세션인가. 계정을 만들기 전까지 true */
  isGuest: boolean;
  /** 게스트 세션조차 못 만든 경우 (프로젝트에서 익명 로그인이 꺼져 있는 등) */
  bootstrapError: Error | null;

  /** 게스트 → 정식 계정. 지금까지 쓴 데이터를 그대로 들고 간다 */
  createAccount: (email: string, password: string, nickname: string) => Promise<CreateAccountResult>;
  /** 이미 있는 계정으로 로그인. 동의하면 게스트 데이터를 새 계정에 합친다 */
  signInWithEmail: (email: string, password: string, transferGuestData?: boolean) => Promise<void>;
  /** 게스트를 소셜 계정으로 전환. user.id와 기존 데이터를 유지한다 */
  connectSocialAccount: (provider: OAuthProvider, nickname: string) => Promise<void>;
  /** 기존 소셜 계정으로 전환. 동의하면 게스트 데이터를 새 계정에 합친다 */
  signInWithSocialAccount: (
    provider: OAuthProvider,
    transferGuestData?: boolean,
  ) => Promise<void>;
  /** 로그아웃하고 다시 게스트로 돌아간다 */
  signOut: () => Promise<void>;
  /** 계정과 데이터를 지우고, 처음 켠 것처럼 새 게스트로 시작한다 */
  deleteAccount: () => Promise<void>;
};

export type CreateAccountResult =
  /** 이메일 확인이 켜져 있어 확인 메일을 보낸 경우 */
  | { status: 'confirmation-sent' }
  /** 곧바로 계정이 된 경우 */
  | { status: 'done' };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    // 캐시를 비울지 판단하는 기준. 세션이 아니라 **사용자 id**를 본다.
    let lastUserId: string | null = null;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      const nextUserId = nextSession?.user?.id ?? null;

      // 사용자가 바뀌면 이전 사용자의 데이터를 지운다.
      //
      // 세션이 null일 때만 지우면 부족하다. 기존 계정으로 로그인하면 세션이
      // **null을 거치지 않고 바로 교체**되는데, 쿼리 키에는 사용자 id가 없어서
      // (`['calendars','mine']` 등) 새 사용자가 이전 사용자의 캘린더·일정을
      // 그대로 넘겨받는다. staleTime이 30초라 그동안 남의 데이터가 보인다.
      //
      // 키마다 id를 넣는 방법도 있지만 하나만 빠뜨려도 같은 사고가 난다.
      // 판단을 한 곳에 두는 편이 안전하다.
      if (nextUserId !== lastUserId) {
        queryClient.clear();
        lastUserId = nextUserId;
      }

      setSession(nextSession);
      if (nextSession) {
        setBootstrapError(null);
        setIsLoading(false);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        // 인증 전환 뒤 앱이 종료됐거나 성공 응답만 유실된 경우를 복구한다. 이관 RPC는
        // 같은 대상 계정의 재호출을 멱등 처리한다.
        if (!data.session.user.is_anonymous) {
          try {
            const transferred = await claimPendingGuestDataTransfer();
            if (transferred) {
              queryClient.clear();
              await clearHomeSnapshotBestEffort();
            }
          } catch {
            // 앱 시작을 막지 않는다. 토큰이 유효하면 다음 시작 때 다시 시도한다.
          }
        }
        setSession(data.session);
        setIsLoading(false);
        return;
      }

      // 가입을 요구하지 않는다. 게스트 세션으로 바로 시작한다.
      const { error } = await supabase.auth.signInAnonymously();
      if (!active) return;
      if (error) {
        setBootstrapError(error);
        setIsLoading(false);
      }
      // 성공하면 onAuthStateChange가 세션을 채우며 isLoading을 내린다
    })();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isGuest: session?.user?.is_anonymous ?? false,
      bootstrapError,

      async createAccount(email, password, nickname) {
        // 게스트 사용자에 이메일/비밀번호를 붙인다. user.id가 그대로라 데이터가 유지된다.
        const { data, error } = await supabase.auth.updateUser({
          email: email.trim(),
          password,
          data: { nickname: nickname.trim() },
        });
        if (error) throw error;

        // profiles 닉네임은 가입 트리거가 채우므로 여기서는 직접 갱신한다
        if (nickname.trim() && data.user) {
          await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', data.user.id);
        }

        // 계정이 됐어도 들고 있던 access token에는 is_anonymous=true가 그대로 남아 있다.
        // 갱신하지 않으면 만료될 때까지(최대 1시간) 공유 같은 기능이 계속 막힌다.
        await supabase.auth.refreshSession();

        // 닉네임과 권한이 동시에 바뀐다. 프로필뿐 아니라 그 값을 품고 있는
        // 구성원 목록 같은 캐시도 전부 다시 받아야 한다.
        await queryClient.invalidateQueries();

        // 이메일 확인이 켜져 있으면 email은 아직 반영되지 않고 확인 메일만 나간다
        return data.user?.email === email.trim() ? { status: 'done' } : { status: 'confirmation-sent' };
      },

      async signInWithEmail(email, password, transferGuestData = false) {
        const guestUserId = await prepareTransferChoice(session, transferGuestData);
        try {
          await withPushDetachedForAccountSwitch(session?.user.id, async () => {
            const { error } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (error) throw error;
          });
        } catch (error) {
          if (guestUserId) await discardIfStillGuest(guestUserId);
          throw error;
        }

        if (transferGuestData) {
          await claimPendingGuestDataTransfer();
          await queryClient.invalidateQueries();
        }
        await clearHomeSnapshotBestEffort();
      },

      async connectSocialAccount(provider, nickname) {
        if (!SOCIAL_AUTH_ENABLED) {
          throw new Error('소셜 로그인은 현재 제공하지 않습니다');
        }

        const currentUserId = session?.user.id;
        if (!currentUserId || !session.user.is_anonymous) {
          throw new Error('게스트 세션에서만 소셜 계정을 연결할 수 있습니다');
        }

        if (provider === 'google' && Platform.OS === 'ios') {
          if (!isNativeGoogleSignInSupported) {
            throw new Error('이 앱 빌드에는 iOS Google 로그인 설정이 없습니다');
          }
          await linkGoogleNative(currentUserId, nickname);
        } else if (provider === 'apple' && isNativeAppleSignInSupported) {
          await linkAppleNative(currentUserId, nickname);
        } else {
          await linkOAuthAccount(provider, currentUserId, nickname);
        }
        await queryClient.invalidateQueries();
      },

      async signInWithSocialAccount(provider, transferGuestData = false) {
        if (!SOCIAL_AUTH_ENABLED) {
          throw new Error('소셜 로그인은 현재 제공하지 않습니다');
        }

        const guestUserId = await prepareTransferChoice(session, transferGuestData);
        try {
          await withPushDetachedForAccountSwitch(session?.user.id, async () => {
            if (provider === 'google' && Platform.OS === 'ios') {
              if (!isNativeGoogleSignInSupported) {
                throw new Error('이 앱 빌드에는 iOS Google 로그인 설정이 없습니다');
              }
              await signInWithGoogleNative();
            } else if (provider === 'apple' && isNativeAppleSignInSupported) {
              await signInWithAppleNative();
            } else {
              await signInWithOAuth(provider);
            }
          });
        } catch (error) {
          if (guestUserId) await discardIfStillGuest(guestUserId);
          throw error;
        }

        if (transferGuestData) {
          await claimPendingGuestDataTransfer();
          await queryClient.invalidateQueries();
        }
        await clearHomeSnapshotBestEffort();
      },

      async signOut() {
        // 세션이 살아 있는 동안 이 기기의 푸시 토큰을 떼어 낸다.
        // 남겨 두면 다음 사용자 화면에 이전 사용자 앞으로 온 알림이 뜬다.
        const leavingUserId = session?.user?.id;
        if (leavingUserId) {
          try {
            await unregisterPush(leavingUserId);
          } catch {
            // 토큰 정리 실패로 로그아웃을 막지는 않는다. 다음 등록 때 덮인다.
          }
        }

        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        await clearHomeSnapshotBestEffort();
        // 로그인 화면에 가두지 않는다. 곧바로 새 게스트 세션으로 되돌린다.
        const { error: guestError } = await supabase.auth.signInAnonymously();
        if (guestError) setBootstrapError(guestError);
      },

      async deleteAccount() {
        // 캘린더 이전·삭제까지 한 트랜잭션으로 처리한다 (0012)
        const { error } = await supabase.rpc('delete_my_account');
        if (error) throw error;
        await clearHomeSnapshotBestEffort();

        // 서버에서 사용자가 사라졌다. 남은 토큰을 들고 있으면 계속 401을 맞는다.
        await supabase.auth.signOut();
        queryClient.clear();

        // 로그아웃과 같은 규칙 — 로그인 화면에 가두지 않는다. 계정을 지웠으니
        // 앱을 처음 켠 것과 같은 상태로 돌려놓는다.
        const { error: guestError } = await supabase.auth.signInAnonymously();
        if (guestError) setBootstrapError(guestError);
      },
    }),
    [session, isLoading, bootstrapError, queryClient],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다');
  return value;
}

async function clearHomeSnapshotBestEffort(): Promise<void> {
  try {
    await clearHomeSnapshotCache();
  } catch {
    // 로컬 표시 캐시 삭제 실패가 로그인·로그아웃·계정 삭제를 막아서는 안 된다.
    // 새 화면에서도 저장된 userId를 현재 세션과 다시 대조하므로 다른 사용자의
    // 스냅샷이 화면에 표시되지는 않는다.
  }
}

async function prepareTransferChoice(
  session: Session | null,
  transferGuestData: boolean,
): Promise<string | null> {
  const user = session?.user;

  if (!user?.is_anonymous) {
    if (transferGuestData) throw new Error('게스트 세션에서만 캘린더를 가져올 수 있습니다');
    return null;
  }

  if (!transferGuestData) {
    await discardPendingGuestDataTransfer(user.id);
    return null;
  }

  await prepareGuestDataTransfer(user.id);
  return user.id;
}

async function discardIfStillGuest(guestUserId: string) {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id === guestUserId && data.session.user.is_anonymous) {
      await discardPendingGuestDataTransfer(guestUserId);
    }
  } catch {
    // 원래 로그인 오류를 보존한다. 토큰은 15분 뒤 서버에서 자동으로 무효가 된다.
  }
}
