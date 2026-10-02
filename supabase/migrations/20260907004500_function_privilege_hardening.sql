-- Post-deployment advisor hardening: trigger helpers are not client RPCs, and
-- utility lookup must not depend on a caller-controlled schema search path.

alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.sync_event_range() set search_path = pg_catalog;
alter function public.uuid_from_object_path(text) set search_path = pg_catalog;
alter function public.is_guest() set search_path = pg_catalog;

-- These functions are invoked only by existing triggers. PostgreSQL checks the
-- owner at execution time; API roles never need to invoke them directly.
revoke all on function
  public.set_updated_at(),
  public.sync_event_range(),
  public.guard_calendar_owner_change(),
  public.guard_member_role_change(),
  public.handle_new_calendar(),
  public.handle_new_user(),
  public.on_calendar_change_log(),
  public.on_comment_log(),
  public.on_event_change_log(),
  public.on_exception_log(),
  public.on_member_leave_log()
from public, anon, authenticated;

-- This preview is a deliberate signed-in RPC. Remove the default PUBLIC grant
-- that otherwise also exposes it to requests without a user session.
revoke all on function public.account_deletion_preview() from public, anon;
grant execute on function public.account_deletion_preview() to authenticated;

-- Policy helpers stay callable by signed-in users, but not by the bare anon
-- API role. Anonymous guest sessions use the authenticated PostgREST role.
revoke all on function public.uuid_from_object_path(text), public.is_guest()
  from public, anon;
grant execute on function public.uuid_from_object_path(text), public.is_guest()
  to authenticated, service_role;
