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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('*, calendars(name, color)')
        .order('done', { ascending: true })
        .order('updated_at', { ascending: false });

      if (error) throw error;

      type Row = Memo & { calendars: { name: string; color: string } | null };
      return (data as unknown as Row[]).map((row) => ({
        ...row,
        calendarName: row.calendars?.name ?? '알 수 없는 캘린더',
        calendarColor: row.calendars?.color ?? DEFAULT_CALENDAR_COLOR,
      }));
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
      const { error } = await supabase.from('memos').update({ done }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }),
  });
}

export function useDeleteMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('memos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }),
  });
}
