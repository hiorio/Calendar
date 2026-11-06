import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import type { StickerKey } from '@/features/stickers/catalog';
import { supabase } from '@/lib/supabase';

export type DaySticker = {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  date: string;
  stickerKey: StickerKey;
};

export const stickerKeys = {
  all: ['calendar-stickers'] as const,
  day: (date: string) => ['calendar-stickers', 'day', date] as const,
  range: (start: string, end: string) =>
    ['calendar-stickers', 'range', start, end] as const,
};

function mapStickerRows(data: unknown): DaySticker[] {
  type Row = {
    id: string;
    calendar_id: string;
    sticker_date: string;
    sticker_key: StickerKey;
    calendars: { name: string; color: string } | null;
  };

  return (data as Row[]).map((row) => ({
    id: row.id,
    calendarId: row.calendar_id,
    calendarName: row.calendars?.name ?? '',
    calendarColor: row.calendars?.color ?? '',
    date: row.sticker_date,
    stickerKey: row.sticker_key,
  }));
}

export function useDayStickers(date: string) {
  const { user } = useAuth();

  return useQuery<DaySticker[]>({
    queryKey: stickerKeys.day(date),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_stickers')
        .select('id, calendar_id, sticker_date, sticker_key, calendars(name, color)')
        .eq('sticker_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return mapStickerRows(data);
    },
  });
}

export function useMonthStickers(start: string, end: string, enabled = true) {
  const { user } = useAuth();

  return useQuery<DaySticker[]>({
    queryKey: stickerKeys.range(start, end),
    enabled: Boolean(user && start && end && enabled),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_stickers')
        .select('id, calendar_id, sticker_date, sticker_key, calendars(name, color)')
        .gte('sticker_date', start)
        .lt('sticker_date', end)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return mapStickerRows(data);
    },
  });
}

export function useSetDaySticker(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      calendarId,
      stickerKey,
    }: {
      calendarId: string;
      stickerKey: StickerKey;
    }) => {
      const { error } = await supabase.rpc('set_calendar_sticker', {
        p_calendar_id: calendarId,
        p_sticker_date: date,
        p_sticker_key: stickerKey,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stickerKeys.all }),
  });
}

export function useRemoveDaySticker(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sticker: DaySticker) => {
      const { data, error } = await supabase
        .from('calendar_stickers')
        .delete()
        .eq('id', sticker.id)
        .eq('calendar_id', sticker.calendarId)
        .eq('sticker_date', date)
        .eq('sticker_key', sticker.stickerKey)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('스티커가 바뀌었거나 제거 권한이 없습니다. 새로고침한 뒤 다시 확인해 주세요.');
      }
    },
    onSuccess: async (_data, sticker) => {
      // 서버에서 삭제한 행만 즉시 반영한다. 진행 중이던 이전 조회가 되살리지 않도록 취소한다.
      await queryClient.cancelQueries({ queryKey: stickerKeys.all });
      queryClient.setQueriesData<DaySticker[]>({ queryKey: stickerKeys.all }, (current) =>
        current?.filter((item) => item.id !== sticker.id),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: stickerKeys.all }),
  });
}
