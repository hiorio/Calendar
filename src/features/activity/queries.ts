import { useInfiniteQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { objectParticle } from '@/lib/korean';
import { supabase } from '@/lib/supabase';

export type ActivityType =
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'
  | 'COMMENT_CREATED'
  | 'MEMO_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT';

export type ActivityEntry = {
  id: number;
  calendar_id: string;
  calendarName: string;
  calendarColor: string;
  actor_id: string | null;
  actorName: string;
  type: ActivityType;
  ref_id: string | null;
  summary: {
    title?: string;
    changed?: string[];
    excerpt?: string;
    nickname?: string;
    kicked?: boolean;
  } | null;
  created_at: string;
  /** 내가 한 일 */
  mine: boolean;
};

/** 한 번에 받아 오는 개수. 화면 하나를 채우고 조금 넘칠 만큼. */
const PAGE_SIZE = 30;

export const activityKeys = {
  all: ['activity'] as const,
};

/**
 * 활동 내역. 최신순.
 *
 * `id`가 bigint 순증이라 그것을 커서로 쓴다(keyset). offset은 페이지를 넘기는 사이에
 * 새 활동이 끼면 같은 행을 두 번 보여 준다.
 */
export function useActivity() {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: activityKeys.all,
    enabled: Boolean(user),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage: ActivityEntry[]) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].id,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('activity_logs')
        // actor_id를 명시한다. 지금은 경로가 하나뿐이라 생략해도 되지만, profiles와
        // activity_logs를 잇는 정션이 생기면 조용히 300으로 깨진다 (댓글에서 겪음).
        .select('id, calendar_id, actor_id, type, ref_id, summary, created_at, profiles!actor_id(nickname), calendars(name, color)')
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam !== null) query = query.lt('id', pageParam);

      const { data, error } = await query;
      if (error) throw error;

      type Row = {
        id: number;
        calendar_id: string;
        actor_id: string | null;
        type: ActivityType;
        ref_id: string | null;
        summary: ActivityEntry['summary'];
        created_at: string;
        profiles: { nickname: string } | null;
        calendars: { name: string; color: string } | null;
      };

      return (data as unknown as Row[]).map((row) => ({
        id: row.id,
        calendar_id: row.calendar_id,
        calendarName: row.calendars?.name ?? '',
        calendarColor: row.calendars?.color ?? '#9AA1AC',
        actor_id: row.actor_id,
        // 탈퇴한 사람의 흔적은 남기고 이름만 잃는다 (actor_id는 on delete set null)
        actorName: row.profiles?.nickname ?? '알 수 없는 사용자',
        type: row.type,
        ref_id: row.ref_id,
        summary: row.summary,
        created_at: row.created_at,
        mine: row.actor_id === user?.id,
      }));
    },
  });
}

const CHANGED_LABELS: Record<string, string> = {
  title: '이름',
  time: '시간',
  location: '장소',
  description: '메모',
  rrule: '반복',
  calendar: '캘린더',
};

/** "민준님이 저녁 약속의 시간을 바꿨어요" 같은 한 줄 */
export function describeActivity(entry: ActivityEntry): { text: string; detail?: string } {
  const who = entry.mine ? '내가' : `${entry.actorName}님이`;
  const title = entry.summary?.title ?? '일정';

  switch (entry.type) {
    case 'EVENT_CREATED':
      return { text: `${who} ${objectParticle(title)} 추가했어요` };

    case 'EVENT_UPDATED': {
      const changed = (entry.summary?.changed ?? [])
        .map((key) => CHANGED_LABELS[key] ?? key)
        .join(' · ');
      return {
        text: changed
          ? `${who} ${title}의 ${objectParticle(changed)} 바꿨어요`
          : `${who} ${objectParticle(title)} 바꿨어요`,
      };
    }

    case 'EVENT_DELETED':
      return { text: `${who} ${objectParticle(title)} 삭제했어요` };

    case 'COMMENT_CREATED':
      return { text: `${who} ${title}에 댓글을 남겼어요`, detail: entry.summary?.excerpt };

    case 'MEMBER_JOINED':
      return { text: `${who} 캘린더에 들어왔어요` };

    case 'MEMBER_LEFT':
      return entry.summary?.kicked
        ? { text: `${who} ${entry.summary?.nickname ?? '구성원'}님을 내보냈어요` }
        : { text: `${entry.summary?.nickname ?? '구성원'}님이 캘린더에서 나갔어요` };

    case 'MEMO_CREATED':
      return { text: `${who} 메모를 남겼어요` };

    default:
      return { text: `${who} 무언가를 바꿨어요` };
  }
}

export function activityIcon(type: ActivityType): string {
  switch (type) {
    case 'EVENT_CREATED':
      return 'add-circle-outline';
    case 'EVENT_UPDATED':
      return 'create-outline';
    case 'EVENT_DELETED':
      return 'trash-outline';
    case 'COMMENT_CREATED':
      return 'chatbubble-outline';
    case 'MEMBER_JOINED':
      return 'person-add-outline';
    case 'MEMBER_LEFT':
      return 'person-remove-outline';
    default:
      return 'ellipse-outline';
  }
}
