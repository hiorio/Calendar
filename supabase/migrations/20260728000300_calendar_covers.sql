-- 캘린더 대표 사진은 calendar-media/{calendar_id}/covers/{uuid}.{ext}에 둔다.
-- 캘린더 설정은 이름·색·커버 모두 구성원이 함께 편집하므로, 커버 경로에 한해
-- 업로더가 아닌 구성원도 교체 후 남은 이전 파일을 정리할 수 있어야 한다.
create policy "media: member can delete calendar cover" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'calendar-media'
    and split_part(name, '/', 2) = 'covers'
    and public.is_calendar_member(public.uuid_from_object_path(name))
  );
