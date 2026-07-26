-- =============================================================================
-- 0012 · 계정 삭제 (설계안 11장 8단계)
--
-- 스토어 심사 필수 요건이다. 앱 안에서 스스로 지울 수 있어야 하고, 문의 메일로
-- 대신 처리하는 식은 통하지 않는다.
--
-- 문제는 삭제가 그냥 되지 않는다는 것이다. `profiles`를 지우면 아래 여섯 개의
-- 참조가 NO ACTION이라 외래키 위반으로 막힌다.
--
--   calendars.owner_id · calendar_invites.created_by · events.created_by
--   event_comments.user_id · memos.created_by · attachments.uploaded_by
--
-- 그래서 "지우면 무엇이 남는가"를 먼저 정한다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 남이 함께 보는 내용은 남기고, 작성자만 지운다
--
-- 설계안 5.3의 원칙과 같다 — **흔적은 남기고 "알 수 없는 사용자"로 표시한다.**
-- 내가 만든 일정과 댓글은 가족의 캘린더에도 들어 있다. 내가 나간다고 그 사람들의
-- 기록까지 사라지면 안 된다. 화면은 이미 이 상태를 처리하고 있다
-- (features/calendars/queries.ts, features/events/comments.ts).
--
-- 컬럼을 nullable로 바꾸고 참조를 set null로 건다.
-- ---------------------------------------------------------------------------
alter table public.events              alter column created_by  drop not null;
alter table public.event_comments      alter column user_id     drop not null;
alter table public.calendar_invites    alter column created_by  drop not null;
alter table public.memos               alter column created_by  drop not null;
alter table public.attachments         alter column uploaded_by drop not null;

alter table public.events
  drop constraint events_created_by_fkey,
  add  constraint events_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.event_comments
  drop constraint event_comments_user_id_fkey,
  add  constraint event_comments_user_id_fkey
       foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.calendar_invites
  drop constraint calendar_invites_created_by_fkey,
  add  constraint calendar_invites_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.memos
  drop constraint memos_created_by_fkey,
  add  constraint memos_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.attachments
  drop constraint attachments_uploaded_by_fkey,
  add  constraint attachments_uploaded_by_fkey
       foreign key (uploaded_by) references public.profiles(id) on delete set null;

-- NOT NULL을 풀었다고 아무나 NULL로 넣을 수 있으면 안 된다. 정책의
-- `created_by = auth.uid()` 검사는 그대로라 NULL은 애초에 통과하지 못하지만,
-- 의도를 스키마에도 남긴다.
comment on column public.events.created_by is
  '만든 사람. 계정을 지우면 NULL이 되고 화면에는 "알 수 없는 사용자"로 나온다.';
comment on column public.event_comments.user_id is
  '쓴 사람. 계정을 지우면 NULL이 된다.';

-- ---------------------------------------------------------------------------
-- 2. 계정 삭제
--
-- `auth.users`는 클라이언트가 직접 지울 수 없다. security definer 함수로 처리한다
-- (초대 수락과 같은 이유 — 하는 일이 전부 DB 안에서 끝나고 한 트랜잭션으로 묶인다).
--
-- 소유한 캘린더는 두 갈래다.
--   · 다른 구성원이 있으면 → **가장 먼저 들어온 사람에게 넘긴다.**
--     남은 사람들이 쓰던 캘린더가 통째로 사라지면 안 된다. 넘기라고 막아 세우면
--     계정을 지울 수 없게 되는데, 그건 심사 요건에 어긋난다.
--   · 나 혼자면 → **통째로 지운다.** 아무도 볼 수 없는 데이터를 남길 이유가 없다.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  cal  record;
  heir uuid;
begin
  if uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  for cal in
    select id from public.calendars where owner_id = uid
  loop
    select m.user_id into heir
      from public.calendar_members m
     where m.calendar_id = cal.id and m.user_id <> uid
     order by m.joined_at asc
     limit 1;

    if heir is not null then
      -- 트리거(0009)가 역할까지 함께 옮긴다
      update public.calendars set owner_id = heir where id = cal.id;
    else
      -- 나 혼자 쓰던 캘린더. 일정·댓글까지 cascade로 함께 사라진다.
      delete from public.calendars where id = cal.id;
    end if;
  end loop;

  -- 남은 캘린더에서 나간다. **auth.users를 지우기 전에** 해야 활동 로그의
  -- actor_id가 살아 있는 프로필을 가리킨다 (cascade로 지워지면 기록이 남지 않는다).
  delete from public.calendar_members where user_id = uid;

  -- profiles는 cascade로, 나머지 작성자 참조는 set null로 정리된다.
  delete from auth.users where id = uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 삭제 전에 무엇이 일어날지 미리 보여 준다
--
-- "캘린더 2개가 넘어가고 1개가 지워집니다"를 눌러 보기 전에 알려 줘야 한다.
-- 되돌릴 수 없는 동작이다.
-- ---------------------------------------------------------------------------
create or replace function public.account_deletion_preview()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with owned as (
    select c.id,
           c.name,
           (select count(*) from public.calendar_members m
             where m.calendar_id = c.id and m.user_id <> auth.uid()) as others
      from public.calendars c
     where c.owner_id = auth.uid()
  )
  select jsonb_build_object(
    'transferred', coalesce(
      (select jsonb_agg(name order by name) from owned where others > 0), '[]'::jsonb),
    'deleted', coalesce(
      (select jsonb_agg(name order by name) from owned where others = 0), '[]'::jsonb),
    'leaving', coalesce(
      (select jsonb_agg(c.name order by c.name)
         from public.calendar_members m
         join public.calendars c on c.id = m.calendar_id
        where m.user_id = auth.uid() and c.owner_id <> auth.uid()), '[]'::jsonb)
  );
$$;

grant execute on function public.account_deletion_preview() to authenticated;
