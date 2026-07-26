/**
 * DB 스키마 타입. `supabase/migrations/`와 1:1로 대응한다.
 *
 * 스키마를 바꿨다면 손으로 고치지 말고 재생성할 것:
 *   npx supabase gen types typescript --linked > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type MemberRole = 'OWNER' | 'MEMBER';
export type ExceptionType = 'CANCELLED' | 'MODIFIED';
export type ActivityType =
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'
  | 'COMMENT_CREATED'
  | 'MEMO_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT';

/** Row → { Row, Insert, Update } 형태로 펼치는 헬퍼 */
type Table<Row, Insert = Row, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** K로 지정한 키는 insert 시 생략 가능 (default / 트리거가 채움) */
type Optional<Row, K extends keyof Row> = Omit<Row, K> & Partial<Pick<Row, K>>;

// ---------------------------------------------------------------------------
// Row 정의
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Calendar = {
  id: string;
  name: string;
  color: string;
  cover_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CalendarMember = {
  calendar_id: string;
  user_id: string;
  role: MemberRole;
  color: string | null;
  muted: boolean;
  joined_at: string;
};

export type CalendarInvite = {
  id: string;
  calendar_id: string;
  code: string;
  /** 계정을 지우면 NULL이 된다 (0012) */
  created_by: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  color: string | null;
  is_all_day: boolean;
  /** is_all_day=false 일 때만 */
  start_at: string | null;
  end_at: string | null;
  /** is_all_day=true 일 때만 */
  start_date: string | null;
  end_date: string | null;
  /** IANA 타임존. 반복 전개 기준 */
  timezone: string;
  rrule: string | null;
  rrule_until: string | null;
  /** 트리거가 유지하는 조회용 파생 컬럼. 직접 쓰지 말 것 */
  range_start: string;
  range_end: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EventException = {
  id: string;
  event_id: string;
  original_start: string;
  type: ExceptionType;
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type EventParticipant = {
  event_id: string;
  user_id: string;
};

export type EventReminder = {
  id: string;
  event_id: string;
  /** NULL이면 캘린더 공통 리마인더 */
  user_id: string | null;
  minutes_before: number;
  created_at: string;
};

export type EventComment = {
  id: string;
  event_id: string;
  /** 계정을 지우면 NULL이 된다 — 내용은 남고 작성자만 사라진다 (0012) */
  user_id: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CommentReaction = {
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Memo = {
  id: string;
  calendar_id: string;
  content: string;
  /** 계정을 지우면 NULL이 된다 (0012) */
  created_by: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  calendar_id: string;
  event_id: string | null;
  comment_id: string | null;
  memo_id: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  /** 계정을 지우면 NULL이 된다 (0012) */
  uploaded_by: string | null;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  calendar_id: string;
  actor_id: string | null;
  type: ActivityType;
  ref_id: string | null;
  summary: Json | null;
  created_at: string;
};

export type DeviceToken = {
  user_id: string;
  expo_token: string;
  platform: 'ios' | 'android';
  updated_at: string;
  disabled_at: string | null;
};

export type NotificationOutbox = {
  id: number;
  user_id: string;
  type: string;
  dedup_key: string;
  payload: Json;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Optional<Profile, 'avatar_url' | 'created_at' | 'updated_at'>>;
      calendars: Table<
        Calendar,
        Optional<Calendar, 'id' | 'color' | 'cover_url' | 'created_at' | 'updated_at' | 'deleted_at'>
      >;
      calendar_members: Table<
        CalendarMember,
        Optional<CalendarMember, 'role' | 'color' | 'muted' | 'joined_at'>
      >;
      calendar_invites: Table<
        CalendarInvite,
        Optional<
          CalendarInvite,
          'id' | 'expires_at' | 'max_uses' | 'use_count' | 'revoked_at' | 'created_at'
        >
      >;
      events: Table<
        EventRow,
        Optional<
          EventRow,
          | 'id'
          | 'description'
          | 'location'
          | 'color'
          | 'is_all_day'
          | 'start_at'
          | 'end_at'
          | 'start_date'
          | 'end_date'
          | 'timezone'
          | 'rrule'
          | 'rrule_until'
          | 'range_start'
          | 'range_end'
          | 'created_at'
          | 'updated_at'
          | 'deleted_at'
        >
      >;
      event_exceptions: Table<
        EventException,
        Optional<
          EventException,
          | 'id'
          | 'title'
          | 'description'
          | 'location'
          | 'start_at'
          | 'end_at'
          | 'start_date'
          | 'end_date'
          | 'created_at'
          | 'updated_at'
        >
      >;
      event_participants: Table<EventParticipant>;
      event_reminders: Table<EventReminder, Optional<EventReminder, 'id' | 'user_id' | 'created_at'>>;
      event_comments: Table<
        EventComment,
        Optional<EventComment, 'id' | 'content' | 'created_at' | 'updated_at' | 'deleted_at'>
      >;
      comment_reactions: Table<CommentReaction, Optional<CommentReaction, 'created_at'>>;
      memos: Table<Memo, Optional<Memo, 'id' | 'done' | 'created_at' | 'updated_at'>>;
      attachments: Table<
        Attachment,
        Optional<Attachment, 'id' | 'event_id' | 'comment_id' | 'memo_id' | 'created_at'>
      >;
      activity_logs: Table<ActivityLog, Optional<ActivityLog, 'id' | 'ref_id' | 'summary' | 'created_at'>>;
      device_tokens: Table<DeviceToken, Optional<DeviceToken, 'updated_at' | 'disabled_at'>>;
      notification_outbox: Table<
        NotificationOutbox,
        Optional<NotificationOutbox, 'id' | 'status' | 'attempts' | 'last_error' | 'created_at' | 'sent_at'>
      >;
    };
    Views: Record<never, never>;
    Functions: {
      is_calendar_member: { Args: { cid: string }; Returns: boolean };
      is_calendar_owner: { Args: { cid: string }; Returns: boolean };
      can_access_event: { Args: { eid: string }; Returns: boolean };
      can_access_comment: { Args: { cid: string }; Returns: boolean };
      shares_calendar_with: { Args: { uid: string }; Returns: boolean };
      is_guest: { Args: Record<string, never>; Returns: boolean };
      invite_preview: { Args: { invite_code: string }; Returns: Json };
      accept_invite: { Args: { invite_code: string }; Returns: Json };
      account_deletion_preview: { Args: Record<string, never>; Returns: Json };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      member_role: MemberRole;
      exception_type: ExceptionType;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<never, never>;
  };
};
