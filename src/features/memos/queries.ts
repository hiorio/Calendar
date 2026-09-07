import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { DEFAULT_CALENDAR_COLOR } from '@/features/calendars/colors';
import { supabase } from '@/lib/supabase';
import type { Memo } from '@/types/database';

export type MemoWithCalendar = Memo & {
  calendarName: string;
  calendarColor: string;
};

export const memoKeys = {
  all: ['memos'] as const,
  list: () => ['memos', 'list'] as const,
};

export function useMemos() {
  const { user } = useAuth();

  return useQuery<MemoWithCalendar[]>({
    queryKey: memoKeys.list(),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const rows = new Map<string, MemoWithCalendar>();
      const pageSize = 250;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('memos')
          .select('*, calendars(name, color)')
          .order('done', { ascending: true })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
          .abortSignal(signal);

        if (error) throw error;

        type Row = Memo & { calendars: { name: string; color: string } | null };
        for (const row of data as unknown as Row[]) rows.set(row.id, {
          ...row,
          calendarName: row.calendars?.name ?? '알 수 없는 캘린더',
          calendarColor: row.calendars?.color ?? DEFAULT_CALENDAR_COLOR,
        });
        if (data.length < pageSize) return [...rows.values()];
      }
    },
  });
}

export function useCreateMemo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ calendarId, content }: { calendarId: string; content: string }) => {
      const { error } = await supabase.from('memos').insert({
        calendar_id: calendarId,
        content: content.trim(),
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }),
  });
}

export function useToggleMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { data, error } = await supabase.from('memos').update({ done }).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('메모가 삭제되었거나 수정 권한이 없습니다. 목록을 새로고침해 주세요.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }),
  });
}

export function useDeleteMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('memos').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('메모가 이미 삭제되었거나 삭제 권한이 없습니다. 목록을 새로고침해 주세요.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }),
  });
}
