import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';
import type { CalendarInvite, MemberRole } from '@/types/database';

export type MyCalendar = {
  id: string;
  name: string;
  color: string;
  owner_id: string;
  /** 내 역할 */
  role: MemberRole;
  memberCount: number;
  /** 이 캘린더의 알림을 껐는가 (나에게만 적용) */
  muted: boolean;
};

export type CalendarMemberWithProfile = {
  user_id: string;
  role: MemberRole;
  muted: boolean;
  joined_at: string;
  nickname: string;
  avatar_url: string | null;
};

export const calendarKeys = {
  all: ['calendars'] as const,
  mine: () => ['calendars', 'mine'] as const,
  members: (calendarId: string) => ['calendars', calendarId, 'members'] as const,
  invites: (calendarId: string) => ['calendars', calendarId, 'invites'] as const,
};

/** 내가 속한 캘린더. 역할과 구성원 수까지 한 번에 가져온다. */
export function useMyCalendars() {
  const { user } = useAuth();

  return useQuery<MyCalendar[]>({
    queryKey: calendarKeys.mine(),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendars')
        .select('id, name, color, owner_id, calendar_members(user_id, role, muted)')
        .order('created_at', { ascending: true });

      if (error) throw error;

      type Row = {
        id: string;
        name: string;
        color: string;
        owner_id: string;
        calendar_members: { user_id: string; role: MemberRole; muted: boolean }[];
      };

      return (data as unknown as Row[]).map((row) => {
        const me = row.calendar_members.find((m) => m.user_id === user!.id);
        return {
          id: row.id,
          name: row.name,
          color: row.color,
          owner_id: row.owner_id,
          role: me?.role ?? 'MEMBER',
          memberCount: row.calendar_members.length,
          muted: me?.muted ?? false,
        };
      });
    },
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('calendars')
        .insert({ name: name.trim(), color, owner_id: user!.id })
        .select('id, name, color')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

export function useUpdateCalendar(calendarId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: { name?: string; color?: string }) => {
      const { error } = await supabase.from('calendars').update(patch).eq('id', calendarId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

/**
 * 캘린더별 알림 끄기/켜기.
 *
 * 화면에서 거르는 것이 아니라 `calendar_members.muted`를 본다 — 알림 큐를 채우는
 * 트리거가 이 값을 보고 아예 넣지 않는다(0010). 끈 사람 몫은 만들어지지도 않는다.
 */
export function useSetMuted() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ calendarId, muted }: { calendarId: string; muted: boolean }) => {
      const { error } = await supabase
        .from('calendar_members')
        .update({ muted })
        .eq('calendar_id', calendarId)
        .eq('user_id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

export function useCalendarMembers(calendarId: string) {
  return useQuery<CalendarMemberWithProfile[]>({
    queryKey: calendarKeys.members(calendarId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_members')
        .select('user_id, role, muted, joined_at, profiles(nickname, avatar_url)')
        .eq('calendar_id', calendarId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      type Row = {
        user_id: string;
        role: MemberRole;
        muted: boolean;
        joined_at: string;
        profiles: { nickname: string; avatar_url: string | null } | null;
      };

      return (data as unknown as Row[]).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        muted: row.muted,
        joined_at: row.joined_at,
        // 5.3: 탈퇴한 구성원의 흔적은 남기고 "알 수 없는 사용자"로 표시한다
        nickname: row.profiles?.nickname ?? '알 수 없는 사용자',
        avatar_url: row.profiles?.avatar_url ?? null,
      }));
    },
  });
}

/** 강퇴(OWNER) 또는 본인 탈퇴. 규칙은 DB 트리거가 강제한다. */
export function useRemoveMember(calendarId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('calendar_members')
        .delete()
        .eq('calendar_id', calendarId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

/** 소유권 이전. calendars.owner_id만 바꾸면 트리거가 members까지 옮긴다. */
export function useTransferOwnership(calendarId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('calendars')
        .update({ owner_id: userId })
        .eq('id', calendarId);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

export function useCalendarInvites(calendarId: string) {
  return useQuery<CalendarInvite[]>({
    queryKey: calendarKeys.invites(calendarId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_invites')
        .select('*')
        .eq('calendar_id', calendarId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** 초대 코드. 링크에 그대로 들어가므로 추측하기 어려워야 한다. */
function generateInviteCode() {
  return Crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function useCreateInvite(calendarId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('calendar_invites')
        .insert({
          calendar_id: calendarId,
          code: generateInviteCode(),
          created_by: user!.id,
          // 기본 7일. 무기한 링크를 기본값으로 두면 유출됐을 때 회수할 방법이 없다.
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.invites(calendarId) }),
  });
}

export function useRevokeInvite(calendarId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('calendar_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.invites(calendarId) }),
  });
}
