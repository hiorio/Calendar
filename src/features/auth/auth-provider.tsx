import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

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
  /** 이미 있는 계정으로 로그인. 게스트로 쌓은 데이터는 따라오지 않는다 */
  signInWithEmail: (email: string, password: string) => Promise<void>;
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        setBootstrapError(null);
        setIsLoading(false);
      } else {
        // 계정이 바뀌었을 수 있다. 이전 사용자의 캐시를 남기지 않는다.
        queryClient.clear();
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
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

      async signInWithEmail(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        // 로그인 화면에 가두지 않는다. 곧바로 새 게스트 세션으로 되돌린다.
        const { error: guestError } = await supabase.auth.signInAnonymously();
        if (guestError) setBootstrapError(guestError);
      },

      async deleteAccount() {
        // 캘린더 이전·삭제까지 한 트랜잭션으로 처리한다 (0012)
        const { error } = await supabase.rpc('delete_my_account');
        if (error) throw error;

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
