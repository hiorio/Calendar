import { useMutation, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';

/** 지우면 무슨 일이 일어나는지. 누르기 전에 보여 준다. */
export type DeletionPreview = {
  /** 다른 구성원에게 넘어갈 캘린더 (내가 소유자이고 남은 사람이 있는 것) */
  transferred: string[];
  /** 함께 사라질 캘린더 (나 혼자 쓰던 것) */
  deleted: string[];
  /** 내가 나가기만 하는 캘린더 (남이 소유자인 것) */
  leaving: string[];
};

export function useDeletionPreview() {
  return useQuery<DeletionPreview>({
    queryKey: ['account', 'deletion-preview'],
    // 되돌릴 수 없는 결정의 근거다. 캐시로 옛날 값을 보여 주면 안 된다.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('account_deletion_preview');
      if (error) throw error;
      return data as DeletionPreview;
    },
  });
}

/**
 * 삭제 자체는 AuthProvider가 한다. 세션을 어떻게 되돌릴지는 로그아웃과 같은
 * 규칙이어야 해서(로그인 화면에 가두지 않는다) 한 곳에 모아 뒀다.
 */
export function useDeleteAccount() {
  const { deleteAccount } = useAuth();
  return useMutation({ mutationFn: deleteAccount });
}
