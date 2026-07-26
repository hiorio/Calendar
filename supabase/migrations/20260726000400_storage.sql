-- =============================================================================
-- 0004 · Storage 버킷 & 정책 (설계안 5.2 마지막 문단)
--
--   calendar-media : 일정/댓글/메모 첨부. 경로 = {calendar_id}/{uuid}.{ext}
--                    → 첫 세그먼트를 파싱해 is_calendar_member()로 검사
--   avatars        : 프로필 이미지. 경로 = {user_id}/{uuid}.{ext}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'calendar-media', 'calendar-media', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- 경로 첫 세그먼트를 uuid로. 형식이 아니면 NULL (→ is_calendar_member가 false)
create or replace function public.uuid_from_object_path(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  seg text := split_part(object_name, '/', 1);
begin
  if seg ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return seg::uuid;
  end if;
  return null;
end;
$$;


-- ---------------------------------------------------------------------------
-- calendar-media
-- ---------------------------------------------------------------------------
create policy "media: member can read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'calendar-media'
    and public.is_calendar_member(public.uuid_from_object_path(name))
  );

create policy "media: member can upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'calendar-media'
    and public.is_calendar_member(public.uuid_from_object_path(name))
    and owner_id = auth.uid()::text
  );

create policy "media: uploader can update" on storage.objects
  for update to authenticated
  using (bucket_id = 'calendar-media' and owner_id = auth.uid()::text)
  with check (
    bucket_id = 'calendar-media'
    and public.is_calendar_member(public.uuid_from_object_path(name))
  );

create policy "media: uploader or owner can delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'calendar-media'
    and (
      owner_id = auth.uid()::text
      or public.is_calendar_owner(public.uuid_from_object_path(name))
    )
  );


-- ---------------------------------------------------------------------------
-- avatars (public read)
-- ---------------------------------------------------------------------------
create policy "avatars: public read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy "avatars: own upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.uuid_from_object_path(name) = auth.uid()
  );

create policy "avatars: own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.uuid_from_object_path(name) = auth.uid())
  with check (bucket_id = 'avatars' and public.uuid_from_object_path(name) = auth.uid());

create policy "avatars: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.uuid_from_object_path(name) = auth.uid());
