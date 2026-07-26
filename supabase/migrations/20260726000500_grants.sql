-- =============================================================================
-- 0005 · 테이블 권한 (GRANT)
--
-- RLS는 GRANT 위에 얹히는 필터다. GRANT가 없으면 정책이 무엇이든 42501로 막힌다.
-- Supabase의 public 스키마 기본 권한은 authenticated에게 Dxtm(TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN)만 주고 SELECT/INSERT/UPDATE/DELETE는 주지 않으므로 여기서
-- 명시적으로 부여한다.
--
-- 부여 목록은 0003의 정책 목록과 1:1로 맞춘다. **새 테이블을 추가하면 여기도
-- 함께 갱신해야 한다.**
--
-- anon에게는 아무 권한도 주지 않는다. 이 앱은 모든 데이터 접근에 로그인이 필요하고,
-- 가입/로그인은 PostgREST가 아니라 GoTrue를 통한다.
--
-- service_role도 기본 권한이 같은 상태라 별도로 부여한다. 이게 없으면 Edge Function
-- (초대 수락, 푸시 발송, 리마인더 스캔)이 전부 permission denied로 막힌다.
-- =============================================================================

grant usage on schema public to authenticated;

grant select, update                 on public.profiles           to authenticated;
grant select, insert, update, delete on public.calendars          to authenticated;
grant select,         update, delete on public.calendar_members   to authenticated;
grant select, insert, update, delete on public.calendar_invites   to authenticated;
grant select, insert, update, delete on public.events             to authenticated;
grant select, insert, update, delete on public.event_exceptions   to authenticated;
grant select, insert,         delete on public.event_participants to authenticated;
grant select, insert,         delete on public.event_reminders    to authenticated;
grant select, insert, update         on public.event_comments     to authenticated;
grant select, insert,         delete on public.comment_reactions  to authenticated;
grant select, insert, update, delete on public.memos              to authenticated;
grant select, insert,         delete on public.attachments        to authenticated;
grant select                         on public.activity_logs      to authenticated;
grant select, insert, update, delete on public.device_tokens      to authenticated;

-- notification_outbox는 service_role 전용이다. 권한을 주지 않는다.
-- (RLS 정책도 없으므로 이중으로 막힌다)
revoke all on public.notification_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------
-- service_role — 서버 로직 전용. RLS를 우회하므로 전체 권한을 준다.
-- 이 키는 Edge Function 환경변수로만 쓰고 클라이언트에 절대 넣지 않는다.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- 헬퍼 함수 실행 권한
grant execute on function public.is_calendar_member(uuid)   to authenticated;
grant execute on function public.is_calendar_owner(uuid)    to authenticated;
grant execute on function public.can_access_event(uuid)     to authenticated;
grant execute on function public.can_access_comment(uuid)   to authenticated;
grant execute on function public.shares_calendar_with(uuid) to authenticated;
