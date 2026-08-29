-- =============================================================================
-- 날짜별 캘린더 스티커
--
-- 여러 캘린더를 한 화면에 겹쳐 보므로 스티커도 캘린더 소유 데이터다.
-- 같은 날짜라도 캘린더마다 하나씩 둘 수 있고, 구성원에게만 보인다.
-- =============================================================================

create table public.calendar_stickers (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  sticker_date  date not null,
  sticker_key   text not null check (
    sticker_key in (
      'morning-reader',
      'garden-sprout',
      'star-celebration',
      'rainy-window',
      'heart-rest',
      'autumn-picnic'
    )
  ),
  -- 계정을 지워도 캘린더 꾸밈은 남긴다.
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (calendar_id, sticker_date)
);

create index idx_calendar_stickers_date
  on public.calendar_stickers (sticker_date, calendar_id);

create trigger trg_calendar_stickers_updated_at
  before update on public.calendar_stickers
  for each row execute function public.set_updated_at();

alter table public.calendar_stickers enable row level security;

create policy "stickers: member can read" on public.calendar_stickers
  for select to authenticated
  using (public.is_calendar_member(calendar_id));

create policy "stickers: member can insert" on public.calendar_stickers
  for insert to authenticated
  with check (
    public.is_calendar_member(calendar_id)
    and created_by = auth.uid()
  );

create policy "stickers: member can update" on public.calendar_stickers
  for update to authenticated
  using (public.is_calendar_member(calendar_id))
  with check (public.is_calendar_member(calendar_id));

create policy "stickers: member can delete" on public.calendar_stickers
  for delete to authenticated
  using (public.is_calendar_member(calendar_id));

-- RLS는 GRANT 위에서만 동작한다. UPDATE는 정책이 보지 않는 식별 컬럼을 잠근다.
grant select, insert, delete on public.calendar_stickers to authenticated;
grant update (sticker_key) on public.calendar_stickers to authenticated;

-- 두 구성원이 동시에 처음 붙여도 unique 충돌로 한쪽이 실패하지 않게 원자적으로 쓴다.
-- security invoker라 위 RLS와 컬럼 권한을 그대로 통과한다.
create or replace function public.set_calendar_sticker(
  p_calendar_id uuid,
  p_sticker_date date,
  p_sticker_key text
)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.calendar_stickers (
    calendar_id,
    sticker_date,
    sticker_key,
    created_by
  )
  values (
    p_calendar_id,
    p_sticker_date,
    p_sticker_key,
    auth.uid()
  )
  on conflict (calendar_id, sticker_date)
  do update set sticker_key = excluded.sticker_key;
$$;

revoke all on function public.set_calendar_sticker(uuid, date, text) from public, anon;
grant execute on function public.set_calendar_sticker(uuid, date, text) to authenticated;

-- 0005의 "all tables"는 그 시점에 있던 테이블만 포함하므로 새 테이블은 따로 연다.
grant all privileges on public.calendar_stickers to service_role;
