import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';

import { calendarKeys } from '@/features/calendars/queries';
import { env } from '@/lib/env';
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
 * 운영 도메인이 설정되면 HTTPS 유니버설 링크를 만들고, 로컬에서는 Expo Linking
 * 스킴/웹 주소를 사용한다.
 */
export function buildInviteLink(code: string) {
  if (env.universalLinkBaseUrl) {
    return `${env.universalLinkBaseUrl}/join?code=${encodeURIComponent(code)}`;
  }
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
