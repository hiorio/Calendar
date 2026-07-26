import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';

/** 화면에서 고를 수 있는 시점. 값은 `minutes_before`. */
export const REMINDER_CHOICES = [
  { minutes: 10, label: '10분 전' },
  { minutes: 60, label: '1시간 전' },
  { minutes: 24 * 60, label: '하루 전' },
] as const;

export const reminderKeys = {
  ofEvent: (eventId: string) => ['reminders', eventId] as const,
};

/**
 * 내 리마인더.
 *
 * `event_reminders.user_id`가 NULL이면 캘린더 공통 리마인더지만, 지금 화면은 **내
 * 것만** 다룬다(정책도 본인 것만 넣게 되어 있다). 남의 폰을 울리게 하는 설정은
 * 만드는 사람과 받는 사람이 달라서 사고가 나기 쉽다.
 */
export function useMyReminders(eventId: string) {
  const { user } = useAuth();

  return useQuery<number[]>({
    queryKey: reminderKeys.ofEvent(eventId),
    enabled: Boolean(eventId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_reminders')
        .select('minutes_before')
        .eq('event_id', eventId)
        .eq('user_id', user!.id);

      if (error) throw error;
      return (data as { minutes_before: number }[]).map((row) => row.minutes_before);
    },
  });
}

export function useToggleReminder(eventId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ minutes, on }: { minutes: number; on: boolean }) => {
      if (!on) {
        const { error } = await supabase
          .from('event_reminders')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', user!.id)
          .eq('minutes_before', minutes);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('event_reminders')
        .insert({ event_id: eventId, user_id: user!.id, minutes_before: minutes });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reminderKeys.ofEvent(eventId) }),
  });
}
