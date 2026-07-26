import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { buildMonthMatrix, toDateKey } from '@/lib/date';
import { compareEvents, eventDayKeys, type EventTimeColumns } from '@/lib/event-time';
import {
  applyExceptions,
  computeRruleUntil,
  expandEvent,
  truncateRruleBefore,
  type EventException,
} from '@/lib/recurrence';
import { supabase } from '@/lib/supabase';
import type { EventRow } from '@/types/database';

/** 화면에 실제로 그려지는 한 건. 반복 일정은 회차마다 하나씩 생긴다. */
export type EventOccurrence = EventRow & {
  calendarName: string;
  /** 일정 자체 색이 없으면 캘린더 색 */
  displayColor: string;
  /** 어느 회차인지 (event_exceptions.original_start와 같은 규칙) */
  originalStart: string;
  /** 반복 일정의 회차인가 */
  isRecurring: boolean;
  /** 목록 key. 같은 일정의 다른 회차를 구분한다. */
  key: string;
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

type EventJoinRow = EventRow & { calendars: { name: string; color: string } | null };

function decorate(row: EventJoinRow) {
  return {
    ...row,
    calendarName: row.calendars?.name ?? '',
    displayColor: row.color ?? row.calendars?.color ?? '#6B7683',
  };
}

/**
 * 격자 구간에 걸치는 일정 전부. 반복 일정은 회차로 펼쳐서 돌려준다.
 *
 * 캘린더별로 나눠 받지 않는다. 표시/숨김은 화면에서 거르는 편이 칩을 눌렀을 때
 * 즉시 반영되고 요청도 줄어든다. 접근 범위는 어차피 RLS가 정한다.
 */
export function useMonthEvents(month: Date) {
  const { user } = useAuth();
  const { start, end } = monthGridRange(month);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return useQuery<EventOccurrence[]>({
    queryKey: eventKeys.range(startIso, endIso),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, calendars(name, color)')
        .is('deleted_at', null)
        // 구간이 겹치는 조건: 시작이 구간 끝보다 앞이고, 끝이 구간 시작보다 뒤.
        // range_end가 NULL인 것은 끝이 없는 반복 일정이다.
        .lt('range_start', endIso)
        .or(`range_end.is.null,range_end.gt.${startIso}`)
        .order('range_start', { ascending: true });

      if (error) throw error;

      const rows = (data as unknown as EventJoinRow[]).map(decorate);

      // 예외는 반복 일정에만 있다. 없으면 왕복을 아낀다.
      const recurringIds = rows.filter((row) => row.rrule).map((row) => row.id);
      let exceptions: EventException[] = [];

      if (recurringIds.length > 0) {
        const { data: exceptionRows, error: exceptionError } = await supabase
          .from('event_exceptions')
          .select('event_id, original_start, type, title, description, location, start_at, end_at, start_date, end_date')
          .in('event_id', recurringIds);

        if (exceptionError) throw exceptionError;
        exceptions = exceptionRows as unknown as EventException[];
      }

      const occurrences = rows.flatMap((row) =>
        expandEvent(row, start, end).map((occurrence) => ({
          ...row,
          ...occurrence,
          isRecurring: Boolean(row.rrule),
          key: `${row.id}:${occurrence.originalStart}`,
        })),
      );

      return applyExceptions(occurrences, exceptions) as EventOccurrence[];
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

/** 마스터 일정 한 건. 수정 화면이 쓴다. */
export function useEvent(eventId: string) {
  return useQuery({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, calendars(name, color)')
        .eq('id', eventId)
        .single();

      if (error) throw error;
      return decorate(data as unknown as EventJoinRow);
    },
  });
}

/** 화면이 넘겨주는 일정 내용. 시간 컬럼은 lib/event-time에서 만든다. */
export type EventInput = EventTimeColumns & {
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  rrule: string | null;
};

/** rrule_until은 화면이 아니라 여기서 채운다. 빠뜨리면 기간 조회가 어긋난다. */
function withRruleUntil(input: EventInput) {
  return { ...input, rrule_until: computeRruleUntil(input) };
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: EventInput) => {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...withRruleUntil(input), created_by: user!.id })
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
      const { error } = await supabase.from('events').update(withRruleUntil(input)).eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

/**
 * 반복 일정에서 이 회차만 바꾼다. 마스터는 그대로 두고 예외 행을 남긴다.
 * 같은 회차를 두 번 고치면 덮어쓴다(unique (event_id, original_start)).
 */
export function useUpdateOccurrence(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ originalStart, input }: { originalStart: string; input: EventInput }) => {
      const { error } = await supabase.from('event_exceptions').upsert(
        {
          event_id: eventId,
          original_start: originalStart,
          type: 'MODIFIED',
          title: input.title,
          description: input.description,
          location: input.location,
          start_at: input.start_at,
          end_at: input.end_at,
          start_date: input.start_date,
          end_date: input.end_date,
        },
        { onConflict: 'event_id,original_start' },
      );

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

/** 수정·삭제가 미치는 범위 */
export type EditScope = 'THIS' | 'FOLLOWING' | 'ALL';

/**
 * 삭제.
 *
 *   THIS      — 이 회차만 취소(예외 행)
 *   FOLLOWING — 이 회차부터 끝까지. 마스터의 UNTIL을 직전으로 당긴다.
 *   ALL       — 일정 전체 soft delete
 *
 * 반복이 아닌 일정은 언제나 ALL이다.
 */
export function useDeleteEvent(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scope,
      originalStart,
      rrule,
      timezone,
    }: {
      scope: EditScope;
      originalStart?: string;
      rrule?: string | null;
      timezone?: string;
    }) => {
      if (scope === 'THIS' && originalStart) {
        const { error } = await supabase.from('event_exceptions').upsert(
          { event_id: eventId, original_start: originalStart, type: 'CANCELLED' },
          { onConflict: 'event_id,original_start' },
        );
        if (error) throw error;
        return;
      }

      if (scope === 'FOLLOWING' && originalStart && rrule) {
        const truncated = truncateRruleBefore(rrule, new Date(originalStart), timezone || 'Asia/Seoul');

        // 마스터를 다시 읽어 rrule_until을 새 규칙으로 다시 계산한다
        const { data, error: readError } = await supabase
          .from('events')
          .select('is_all_day, start_at, end_at, start_date, end_date, timezone')
          .eq('id', eventId)
          .single();
        if (readError) throw readError;

        const { error } = await supabase
          .from('events')
          .update({
            rrule: truncated,
            rrule_until: computeRruleUntil({ ...(data as EventTimeColumns), rrule: truncated }),
          })
          .eq('id', eventId);
        if (error) throw error;
        return;
      }

      // 행을 지우지 않는다. 활동 내역과 기기 간 동기화가 "지워졌다"는 사실을
      // 알아야 한다 (설계안 4.2).
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
