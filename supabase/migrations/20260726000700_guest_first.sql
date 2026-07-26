-- =============================================================================
-- 0007 · 게스트 우선(anonymous) 사용
--
-- 앱을 처음 켠 사람에게 가입을 요구하지 않는다. Supabase의 익명 사용자로 바로
-- 시작하고, 공유처럼 계정이 꼭 필요한 순간에만 가입시킨다.
--
-- 익명 사용자도 JWT의 role은 authenticated라 기존 RLS 정책은 그대로 동작한다.
-- 구분이 필요한 곳에서만 is_anonymous 클레임을 본다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 익명 사용자의 프로필 닉네임
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nickname', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      -- 익명 사용자는 이메일도 이름도 없다
      case when new.is_anonymous then '나' else '사용자' end
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- "공유하려면 가입" 을 DB에서 강제한다
--
-- 초대 링크 발급은 실제 계정이 있어야 한다. UI에서만 막으면 anon key로 우회된다.
-- 익명 사용자의 JWT에는 is_anonymous=true 클레임이 들어 있다.
-- ---------------------------------------------------------------------------
create or replace function public.is_guest()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

grant execute on function public.is_guest() to authenticated;

drop policy "invites: member can create" on public.calendar_invites;

create policy "invites: signed-up member can create" on public.calendar_invites
  for insert to authenticated
  with check (
    public.is_calendar_member(calendar_id)
    and created_by = auth.uid()
    and not public.is_guest()
  );
