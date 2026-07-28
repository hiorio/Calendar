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
};

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

      type Row = {
        id: string;
        calendar_id: string;
        sticker_date: string;
        sticker_key: StickerKey;
        calendars: { name: string; color: string } | null;
      };

      return (data as unknown as Row[]).map((row) => ({
        id: row.id,
        calendarId: row.calendar_id,
        calendarName: row.calendars?.name ?? '',
        calendarColor: row.calendars?.color ?? '',
        date: row.sticker_date,
        stickerKey: row.sticker_key,
      }));
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stickerKeys.day(date) }),
  });
}

export function useRemoveDaySticker(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (calendarId: string) => {
      const { error } = await supabase
        .from('calendar_stickers')
        .delete()
        .eq('calendar_id', calendarId)
        .eq('sticker_date', date);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stickerKeys.day(date) }),
  });
}
