import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { buildMonthMatrix, toDateKey, type WeekStart } from '@/lib/date';
import { compareEvents, dateKeyDistance, eventDayKeys, occurrenceTime, type EventTimeColumns } from '@/lib/event-time';
import {
  applyExceptions,
  computeRruleUntil,
  expandEventWithExceptions,
  isOriginalOccurrence,
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
  exception: (eventId: string, originalStart: string | null) =>
    ['events', 'exception', eventId, originalStart] as const,
  source: (startIso: string, endIso: string) => ['events', 'source', startIso, endIso] as const,
  search: (query: string, limit = 50) => ['events', 'search', query, limit] as const,
};

/** 월간 격자가 실제로 그리는 6주 구간. 앞뒤 달의 칸에도 일정이 찍혀야 한다. */
export function monthGridRange(month: Date, weekStart: WeekStart = 'sunday'): { start: Date; end: Date } {
  const weeks = buildMonthMatrix(month, weekStart);
  const start = new Date(weeks[0][0]);
  start.setHours(0, 0, 0, 0);

  const last = weeks[weeks.length - 1][6];
  const end = new Date(last);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1); // 마지막 칸의 끝(배타적)

  return { start, end };
}

type EventJoinRow = EventRow & { calendars: { name: string; color: string } | null };
const EXCEPTION_COLUMNS = 'event_id, original_start, type, title, description, location, is_all_day, start_at, end_at, start_date, end_date' as const;
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

/** API 행 상한보다 작은 페이지를 끝까지 읽으며 호출자는 반드시 고유 키로 정렬한다. */
async function readAllPages<T>(request: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await request(offset);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function abortable<T>(request: T, signal?: AbortSignal): T {
  return signal ? (request as T & { abortSignal(signal: AbortSignal): T }).abortSignal(signal) : request;
}

async function readMastersByIds(ids: string[], signal?: AbortSignal): Promise<EventJoinRow[]> {
  const rows: EventJoinRow[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ID_BATCH_SIZE);
    const { data, error } = await abortable(supabase.from('events').select('*, calendars(name, color)')
      .in('id', batch).is('deleted_at', null).order('id'), signal);
    if (error) throw error;
    rows.push(...(data as unknown as EventJoinRow[]));
  }
  return rows;
}

function decorate(row: EventJoinRow) {
  return {
    ...row,
    calendarName: row.calendars?.name ?? '',
    displayColor: row.color ?? row.calendars?.color ?? '#9AA1AC',
  };
}

type EventSource = { rows: ReturnType<typeof decorate>[]; exceptions: EventException[]; occurrenceKeys: string[] };
function cachedEventSource(client: ReturnType<typeof useQueryClient>, eventId: string, originalStart?: string | null) {
  let latest: { row: ReturnType<typeof decorate>; exceptions: EventException[]; updatedAt: number } | undefined;
  for (const [key, source] of client.getQueriesData<EventSource>({ queryKey: ['events', 'source'] })) {
    const state = client.getQueryState(key);
    if (state?.isInvalidated) continue;
    const updatedAt = state?.dataUpdatedAt ?? 0;
    if (!source || (latest && latest.updatedAt >= updatedAt)) continue;
    if (originalStart) {
      const instant = Date.parse(originalStart);
      if (!Number.isFinite(instant) || !source.occurrenceKeys.includes(`${eventId}:${new Date(instant).toISOString()}`)) continue;
    }
    const row = source.rows.find((item) => item.id === eventId);
    if (row) latest = { row, exceptions: source.exceptions.filter((item) => item.event_id === eventId), updatedAt };
  }
  return latest;
}

/**
 * 격자 구간에 걸치는 일정 전부. 반복 일정은 회차로 펼쳐서 돌려준다.
 *
 * 캘린더별로 나눠 받지 않는다. 표시/숨김은 화면에서 거르는 편이 칩을 눌렀을 때
 * 즉시 반영되고 요청도 줄어든다. 접근 범위는 어차피 RLS가 정한다.
 */
export function useMonthEvents(
  month: Date,
  weekStart: WeekStart = 'sunday',
  enabled = true,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { start, end } = monthGridRange(month, weekStart);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return useQuery<EventOccurrence[]>({
    queryKey: eventKeys.range(startIso, endIso),
    enabled: Boolean(user && enabled),
    queryFn: async ({ signal }: { signal?: AbortSignal } = {}) => {
      // 종일 range_*는 일정 타임존으로 저장된다. 기기 날짜 경계와의 시차를
      // 넉넉히 포함하고 마지막에 실제 날짜/순간으로 정확히 거른다.
      const paddedStart = new Date(start.getTime() - 36 * 3_600_000).toISOString();
      const paddedEnd = new Date(end.getTime() + 36 * 3_600_000).toISOString();
      const [data, moved] = await Promise.all([readAllPages((offset) => abortable(supabase
        .from('events')
        .select('*, calendars(name, color)')
        .is('deleted_at', null)
        // 구간이 겹치는 조건: 시작이 구간 끝보다 앞이고, 끝이 구간 시작보다 뒤.
        // range_end가 NULL인 것은 끝이 없는 반복 일정이다.
        .lt('range_start', paddedEnd)
        .or(`range_end.is.null,range_end.gt.${paddedStart}`)
        .order('id').range(offset, offset + PAGE_SIZE - 1), signal)),
      readAllPages((offset) => abortable(supabase.from('event_exceptions')
        .select(EXCEPTION_COLUMNS).eq('type', 'MODIFIED')
        .or(`and(start_at.lt.${endIso},end_at.gt.${startIso}),and(start_date.lte.${toDateKey(new Date(end.getTime() - 1))},end_date.gte.${toDateKey(start)})`)
        .order('event_id').order('original_start').range(offset, offset + PAGE_SIZE - 1), signal))]);
      const masters = new Map((data as unknown as EventJoinRow[]).map((row) => [row.id, row]));
      const missingIds = [...new Set(moved.map((exception) => exception.event_id))].filter((id) => !masters.has(id));
      for (const row of await readMastersByIds(missingIds, signal)) masters.set(row.id, row);
      const rows = [...masters.values()].map(decorate);

      // 예외는 반복 일정에만 있다. 없으면 왕복을 아낀다.
      const recurringIds = rows.filter((row) => row.rrule).map((row) => row.id);
      // 범위 밖에서 옮겨 온 회차는 별도 결과를 유지한다.
      const exceptionsByKey = new Map(moved.map((patch) => [`${patch.event_id}:${Date.parse(patch.original_start)}`, patch as EventException]));

      for (let offset = 0; offset < recurringIds.length; offset += ID_BATCH_SIZE) {
        const ids = recurringIds.slice(offset, offset + ID_BATCH_SIZE);
        const longestSpan = Math.max(0, ...ids.map((id) => {
          const row = masters.get(id)!;
          return row.is_all_day
            ? (dateKeyDistance(row.start_date!, row.end_date!) + 1) * 86_400_000
            : Date.parse(row.end_at!) - Date.parse(row.start_at!);
        }));
        const originalFrom = new Date(Date.parse(paddedStart) - longestSpan).toISOString();
        const exceptionRows = await readAllPages((page) => abortable(supabase
          .from('event_exceptions')
          .select(EXCEPTION_COLUMNS).in('event_id', ids)
          .gte('original_start', originalFrom).lt('original_start', paddedEnd)
          .order('event_id').order('original_start').range(page, page + PAGE_SIZE - 1), signal));
        for (const patch of exceptionRows as EventException[]) exceptionsByKey.set(`${patch.event_id}:${Date.parse(patch.original_start)}`, patch);
      }
      const exceptions = [...exceptionsByKey.values()];

      if (signal?.aborted) throw new Error('조회가 취소되었습니다.');
      const exceptionsByEvent = new Map<string, EventException[]>();
      for (const exception of exceptions) {
        const list = exceptionsByEvent.get(exception.event_id) ?? [];
        list.push(exception);
        exceptionsByEvent.set(exception.event_id, list);
      }
      const occurrences = rows.flatMap((row) => {
        const patches = exceptionsByEvent.get(row.id) ?? [];
        return expandEventWithExceptions(row, start, end, patches).map((occurrence) => {
          return {
          ...row,
          ...occurrence,
          isRecurring: Boolean(row.rrule),
          key: `${row.id}:${occurrence.originalStart}`,
          };
        });
      });
      // 범위당 하나만 보관한다. 수천 개의 상세 쿼리를 미리 생성하지 않는다.
      // 실제로 상세를 열 때 회차가 아닌 서버 원본을 initialData로 읽는다.
      queryClient.setQueryData(eventKeys.source(startIso, endIso), { rows, exceptions, occurrenceKeys: occurrences.map((item) => item.key) } satisfies EventSource);

      return occurrences as EventOccurrence[];
    },
  });
}

export type EventSearchResult = ReturnType<typeof decorate> & { key: string; originalStart?: string };

/** 마스터 제목과 개별 회차 제목을 함께 검색하고 회차 결과는 원래 ID로 연다. */
export function useEventSearch(rawQuery: string, limit = 50) {
  const { user } = useAuth();
  const query = rawQuery.trim();

  return useQuery<EventSearchResult[]>({
    queryKey: eventKeys.search(query, limit),
    enabled: Boolean(user && query),
    queryFn: async ({ signal }: { signal?: AbortSignal } = {}) => {
      const escaped = query.replaceAll('%', '\\%').replaceAll('_', '\\_');
      const [mastersResult, exceptionsResult] = await Promise.all([abortable(supabase
        .from('events')
        .select('*, calendars(name, color)')
        .is('deleted_at', null)
        .ilike('title', `%${escaped}%`)
        .order('range_start', { ascending: false })
        .order('id').limit(limit + 1), signal),
        abortable(supabase.from('event_exceptions')
          .select(EXCEPTION_COLUMNS).eq('type', 'MODIFIED').ilike('title', `%${escaped}%`)
          .order('original_start', { ascending: false }).order('event_id').limit(limit + 1), signal)]);
      const { data, error } = mastersResult;

      if (error) throw error;
      const results: EventSearchResult[] = (data as unknown as EventJoinRow[]).map((row) => ({ ...decorate(row), key: row.id }));
      const { data: exceptions, error: exceptionError } = exceptionsResult;
      if (exceptionError) throw exceptionError;
      const masters = await readMastersByIds([...new Set((exceptions ?? []).map((row) => row.event_id))], signal);
      for (const row of masters) {
        for (const exception of (exceptions ?? []).filter((item) => item.event_id === row.id)) {
          const original = new Date(exception.original_start);
          if (!isOriginalOccurrence(row, original)) continue;
          const effective = applyExceptions([{ ...occurrenceTime(decorate(row), exception.original_start), originalStart: original.toISOString() }], [exception])[0];
          results.push({ ...effective, key: `${row.id}:${original.toISOString()}`, originalStart: original.toISOString() });
        }
      }
      return results.sort((a, b) => (b.start_date ?? b.start_at ?? '').localeCompare(a.start_date ?? a.start_at ?? '')).slice(0, limit + 1);
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    staleTime: 30_000,
    initialData: () => cachedEventSource(queryClient, eventId)?.row,
    initialDataUpdatedAt: () => cachedEventSource(queryClient, eventId)?.updatedAt,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('events')
        .select('*, calendars(name, color)')
        .eq('id', eventId)
        .abortSignal(signal)
        .single();

      if (error) throw error;
      return decorate(data as unknown as EventJoinRow);
    },
  });
}

/**
 * 이 회차에 걸린 예외 하나. 없으면 null.
 *
 * 상세 화면이 마스터만 읽으면, 회차를 고쳐 놓고 다시 열었을 때 마스터 값이 보인다.
 */
export function useOccurrenceException(eventId: string, originalStart: string | null) {
  const queryClient = useQueryClient();
  return useQuery<EventException | null>({
    queryKey: eventKeys.exception(eventId, originalStart),
    enabled: Boolean(eventId && originalStart),
    staleTime: 30_000,
    initialData: () => {
      const rows = cachedEventSource(queryClient, eventId, originalStart)?.exceptions;
      return rows ? rows.find((row) => Date.parse(row.original_start) === Date.parse(originalStart ?? '')) ?? null : undefined;
    },
    initialDataUpdatedAt: () => cachedEventSource(queryClient, eventId, originalStart)?.updatedAt,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('event_exceptions')
        .select(
          EXCEPTION_COLUMNS,
        )
        .eq('event_id', eventId)
        .eq('original_start', originalStart!)
        .abortSignal(signal)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as EventException) ?? null;
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
      const { error } = await supabase.from('events').update(withRruleUntil(input)).eq('id', eventId).select('id').single();
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
          // NULL은 예전 데이터의 "마스터 상속" 의미다. 빈 문자열은 명시적인 비움.
          description: input.description ?? '',
          location: input.location ?? '',
          // 이 회차만 종일↔시간 지정을 바꾼 경우까지 적어 둔다 (0014).
          // 없으면 전개할 때 마스터의 종일 여부를 따라가 값이 어긋난다.
          is_all_day: input.is_all_day,
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
