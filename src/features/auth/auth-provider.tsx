import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** 최초 세션 복원이 끝나기 전에는 라우팅을 결정하면 안 된다 */
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, nickname: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

export type SignUpResult =
  /** 이메일 확인이 켜져 있어 확인 메일을 보낸 경우 */
  | { status: 'confirmation-sent' }
  /** 바로 로그인된 경우 */
  | { status: 'signed-in' };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      // 로그아웃/계정 전환 시 이전 사용자의 캐시가 남지 않도록
      if (!nextSession) queryClient.clear();
    });

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

      async signInWithEmail(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signUpWithEmail(email, password, nickname) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // handle_new_user 트리거가 profiles.nickname으로 옮겨 담는다
          options: { data: { nickname: nickname.trim() } },
        });
        if (error) throw error;
        return data.session ? { status: 'signed-in' } : { status: 'confirmation-sent' };
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, isLoading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다');
  return value;
}
