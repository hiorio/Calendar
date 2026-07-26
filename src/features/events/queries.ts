import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { buildMonthMatrix, toDateKey } from '@/lib/date';
import { compareEvents, eventDayKeys, type EventTimeColumns } from '@/lib/event-time';
import { supabase } from '@/lib/supabase';
import type { EventRow } from '@/types/database';

export type EventWithCalendar = EventRow & {
  calendarName: string;
  /** 일정 자체 색이 없으면 캘린더 색 */
  displayColor: string;
};

export const eventKeys = {
  all: ['events'] as const,
  /** 격자 범위 단위로 캐시한다. 달을 넘겨도 같은 범위면 다시 받지 않는다. */
  range: (startIso: string, endIso: string) => ['events', 'range', startIso, endIso] as const,
  detail: (eventId: string) => ['events', 'detail', eventId] as const,
};

/** 월간 격자가 실제로 그리는 6주 구간. 앞뒤 달의 칸에도 일정이 찍혀야 한다. */
export function monthGridRange(month: Date): { start: Date; end: Date } {
  const weeks = buildMonthMatrix(month);
  const start = new Date(weeks[0][0]);
  start.setHours(0, 0, 0, 0);

  const last = weeks[weeks.length - 1][6];
  const end = new Date(last);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1); // 마지막 칸의 끝(배타적)

  return { start, end };
}

/**
 * 격자 구간에 걸치는 일정 전부.
 *
 * 캘린더별로 나눠 받지 않는다. 표시/숨김은 화면에서 거르는 편이 칩을 눌렀을 때
 * 즉시 반영되고 요청도 줄어든다. 접근 범위는 어차피 RLS가 정한다.
 */
export function useMonthEvents(month: Date) {
  const { user } = useAuth();
  const { start, end } = monthGridRange(month);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return useQuery<EventWithCalendar[]>({
    queryKey: eventKeys.range(startIso, endIso),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, calendars(name, color)')
        .is('deleted_at', null)
        // 구간이 겹치는 조건: 시작이 구간 끝보다 앞이고, 끝이 구간 시작보다 뒤.
        // range_end가 NULL인 것은 끝이 없는 반복 일정이다(4단계).
        .lt('range_start', endIso)
        .or(`range_end.is.null,range_end.gt.${startIso}`)
        .order('range_start', { ascending: true });

      if (error) throw error;

      type Row = EventRow & { calendars: { name: string; color: string } | null };

      return (data as unknown as Row[]).map((row) => ({
        ...row,
        calendarName: row.calendars?.name ?? '',
        displayColor: row.color ?? row.calendars?.color ?? '#6B7683',
      }));
    },
  });
}

/** 'YYYY-MM-DD' → 그 날에 걸치는 일정들 (종일 먼저, 그다음 시작 시각 순) */
export function groupByDate<T extends EventTimeColumns>(events: T[]): Record<string, T[]> {
  const byDate: Record<string, T[]> = {};

  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      (byDate[key] ??= []).push(event);
    }
  }

  for (const key of Object.keys(byDate)) {
    byDate[key].sort(compareEvents);
  }

  return byDate;
}

export function useEvent(eventId: string) {
  return useQuery<EventWithCalendar>({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, calendars(name, color)')
        .eq('id', eventId)
        .single();

      if (error) throw error;

      const row = data as unknown as EventRow & { calendars: { name: string; color: string } | null };
      return {
        ...row,
        calendarName: row.calendars?.name ?? '',
        displayColor: row.color ?? row.calendars?.color ?? '#6B7683',
      };
    },
  });
}

/** 화면이 넘겨주는 일정 내용. 시간 컬럼은 lib/event-time에서 만든다. */
export type EventInput = EventTimeColumns & {
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
};

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: EventInput) => {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...input, created_by: user!.id })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: EventInput) => {
      const { error } = await supabase.from('events').update(input).eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

/**
 * 삭제는 soft delete다. 활동 내역과 기기 간 동기화가 "지워졌다"는 사실을 알아야 해서
 * 행을 지우지 않고 deleted_at을 채운다 (설계안 4.2).
 */
export function useDeleteEvent(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', eventId);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

/** 선택한 날의 일정만. 월 조회 결과를 그대로 재사용한다. */
export function eventsOnDate<T extends EventTimeColumns>(events: T[], date: Date): T[] {
  return groupByDate(events)[toDateKey(date)] ?? [];
}
