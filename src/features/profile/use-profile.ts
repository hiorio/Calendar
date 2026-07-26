import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export const profileQueryKey = (userId: string) => ['profile', userId] as const;

/** 내 프로필. profiles는 가입 시 트리거가 만들어 두므로 항상 존재한다. */
export function useProfile() {
  const { user } = useAuth();

  return useQuery<Profile>({
    queryKey: profileQueryKey(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      if (error) throw error;
      return data;
    },
  });
}
