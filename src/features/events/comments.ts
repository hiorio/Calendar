import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';

export type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  nickname: string;
  avatar_url: string | null;
  /** 내가 쓴 것 (수정·삭제 가능) */
  mine: boolean;
};

export const commentKeys = {
  all: ['comments'] as const,
  ofEvent: (eventId: string) => ['comments', eventId] as const,
};

/**
 * 일정 댓글.
 *
 * 참여자와 마찬가지로 **마스터 일정**에 붙는다. 반복 일정의 댓글은 모든 회차가
 * 함께 본다. 화면에서 그 사실을 알린다 — 3월 회차에 남긴 말이 4월에도 보이는 것을
 * 모르면 곤란하다.
 */
export function useComments(eventId: string) {
  const { user } = useAuth();

  return useQuery<Comment[]>({
    queryKey: commentKeys.ofEvent(eventId),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_comments')
        // `profiles`만 쓰면 PostgREST가 300(Multiple Choices)을 돌려준다.
        // comment_reactions가 event_comments와 profiles 사이의 정션이라 경로가 둘이다.
        // 어느 외래키인지 컬럼으로 못 박는다.
        .select('id, user_id, content, created_at, updated_at, profiles!user_id(nickname, avatar_url)')
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      type Row = {
        id: string;
        user_id: string;
        content: string | null;
        created_at: string;
        updated_at: string;
        profiles: { nickname: string; avatar_url: string | null } | null;
      };

      return (data as unknown as Row[]).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        content: row.content ?? '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        nickname: row.profiles?.nickname ?? '알 수 없는 사용자',
        avatar_url: row.profiles?.avatar_url ?? null,
        mine: row.user_id === user?.id,
      }));
    },
  });
}

export function useAddComment(eventId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('event_comments')
        .insert({ event_id: eventId, user_id: user!.id, content: content.trim() });

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.ofEvent(eventId) }),
  });
}

/**
 * 댓글 삭제.
 *
 * event_comments에는 DELETE 권한을 주지 않았다(0005). 대화의 흐름이 남아야 해서
 * 행을 지우지 않고 deleted_at을 채운다. 정책상 작성자 본인만 할 수 있다.
 */
export function useDeleteComment(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('event_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', commentId);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.ofEvent(eventId) }),
  });
}

/** '방금', '3분 전', '어제', '8월 5일' */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso);
  const diffMinutes = Math.floor((Date.now() - then.getTime()) / 60_000);

  if (diffMinutes < 1) return '방금';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffHours < 48) return '어제';

  return `${then.getMonth() + 1}월 ${then.getDate()}일`;
}
