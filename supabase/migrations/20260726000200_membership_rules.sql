-- =============================================================================
-- 0002 · 구성원 규칙 (설계안 5.3)
--
--   · OWNER는 소유권을 넘기지 않고는 탈퇴할 수 없다
--   · 마지막 1인이 나가면 캘린더는 soft delete
--   · 역할 변경은 OWNER만
--
-- auth.uid()가 NULL인 경우(= service_role로 실행되는 Edge Function)는
-- 모든 가드를 통과시킨다. 서버 로직은 자체적으로 검증한다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 소유권 이전: calendars.owner_id 변경은 현 OWNER만. members 테이블도 함께 옮긴다.
-- ---------------------------------------------------------------------------
create or replace function public.guard_calendar_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() <> old.owner_id then
    raise exception '소유권 이전은 현재 소유자만 할 수 있습니다'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.calendar_members
    where calendar_id = new.id and user_id = new.owner_id
  ) then
    raise exception '새 소유자는 이 캘린더의 구성원이어야 합니다'
      using errcode = '23514';
  end if;

  update public.calendar_members
     set role = 'MEMBER'
   where calendar_id = new.id and user_id = old.owner_id;

  update public.calendar_members
     set role = 'OWNER'
   where calendar_id = new.id and user_id = new.owner_id;

  return new;
end;
$$;

create trigger trg_calendars_guard_owner_change
  before update of owner_id on public.calendars
  for each row execute function public.guard_calendar_owner_change();


-- ---------------------------------------------------------------------------
-- 역할 변경은 OWNER만 (본인이 자기 role을 올리는 것 차단)
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not exists (
    select 1 from public.calendar_members
    where calendar_id = new.calendar_id
      and user_id = auth.uid()
      and role = 'OWNER'
  ) then
    raise exception '역할 변경은 캘린더 소유자만 할 수 있습니다'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_members_guard_role_change
  before update of role on public.calendar_members
  for each row execute function public.guard_member_role_change();


-- ---------------------------------------------------------------------------
-- 탈퇴/강퇴 가드 + 마지막 1인 탈퇴 시 캘린더 soft delete
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_leave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  other_members int;
begin
  select count(*) into other_members
    from public.calendar_members
   where calendar_id = old.calendar_id
     and user_id <> old.user_id;

  if old.role = 'OWNER' and other_members > 0 then
    raise exception '소유자는 다른 구성원에게 소유권을 이전한 뒤 나갈 수 있습니다'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

create trigger trg_members_guard_leave
  before delete on public.calendar_members
  for each row execute function public.guard_member_leave();


create or replace function public.soft_delete_empty_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.calendar_members where calendar_id = old.calendar_id
  ) then
    update public.calendars
       set deleted_at = now()
     where id = old.calendar_id and deleted_at is null;
  end if;

  return old;
end;
$$;

create trigger trg_members_soft_delete_empty_calendar
  after delete on public.calendar_members
  for each row execute function public.soft_delete_empty_calendar();
