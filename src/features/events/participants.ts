import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type Participant = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
};

export const participantKeys = {
  all: ['participants'] as const,
  ofEvent: (eventId: string) => ['participants', eventId] as const,
};

/**
 * 일정 참여자.
 *
 * 참여자는 **마스터 일정**에 붙는다. 반복 일정이라면 모든 회차가 같은 참여자를
 * 공유한다 — 스키마가 `event_participants(event_id, user_id)`라 회차를 구분하지
 * 않는다. "이번 주만 빠짐"이 필요해지면 그때 예외 테이블처럼 다뤄야 한다.
 */
export function useParticipants(eventId: string) {
  return useQuery<Participant[]>({
    queryKey: participantKeys.ofEvent(eventId),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_participants')
        .select('user_id, profiles(nickname, avatar_url)')
        .eq('event_id', eventId);

      if (error) throw error;

      type Row = { user_id: string; profiles: { nickname: string; avatar_url: string | null } | null };

      return (data as unknown as Row[]).map((row) => ({
        user_id: row.user_id,
        nickname: row.profiles?.nickname ?? '알 수 없는 사용자',
        avatar_url: row.profiles?.avatar_url ?? null,
      }));
    },
  });
}

/** 참여자 넣기/빼기. 캘린더 구성원이면 누구든 서로를 넣고 뺄 수 있다. */
export function useToggleParticipant(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, joined }: { userId: string; joined: boolean }) => {
      if (joined) {
        const { error } = await supabase
          .from('event_participants')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', userId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('event_participants')
        .insert({ event_id: eventId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: participantKeys.ofEvent(eventId) }),
  });
}
