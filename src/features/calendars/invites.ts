import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';

import { calendarKeys } from '@/features/calendars/queries';
import { supabase } from '@/lib/supabase';

export type InvitePreview = {
  valid: boolean;
  reason: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' | null;
  calendar_id: string | null;
  calendar_name: string | null;
  calendar_color: string | null;
  member_count: number;
  inviter: string | null;
  already_member: boolean;
};

/**
 * 초대 링크.
 *
 * 개발 중에는 `timeflower://join?code=...` / `http://localhost:8081/join?code=...`가 된다.
 * 실제 출시할 때는 메신저에서 눌리도록 웹 도메인 기반의 유니버설 링크로 바꿔야 한다.
 */
export function buildInviteLink(code: string) {
  return Linking.createURL('/join', { queryParams: { code } });
}

export function useInvitePreview(code: string | undefined) {
  return useQuery<InvitePreview>({
    queryKey: ['invite-preview', code],
    enabled: Boolean(code),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invite_preview', { invite_code: code! });
      if (error) throw error;
      return data as unknown as InvitePreview;
    },
  });
}

export type AcceptResult = {
  calendar_id: string;
  calendar_name: string;
  already_member: boolean;
};

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { invite_code: code });
      if (error) throw error;
      return data as unknown as AcceptResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}
