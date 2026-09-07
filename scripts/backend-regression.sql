-- Local, rollback-only DB regression fixtures. Run after db:reset using a local
-- postgres connection; never use --linked. Storage rows below are fake metadata
-- inside this rolled-back transaction, not real uploaded files.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'REGRESSION: %', message; end if; end; $$;

insert into auth.users(id,email,is_anonymous) values
 ('9f6d0000-0000-4000-8000-000000000001','backend-a@example.invalid',false),
 ('9f6d0000-0000-4000-8000-000000000002','backend-b@example.invalid',false),
 ('9f6d0000-0000-4000-8000-000000000003','backend-c@example.invalid',false);
insert into public.calendars(id,name,owner_id) values
 ('9f6d1000-0000-4000-8000-000000000001','audit A','9f6d0000-0000-4000-8000-000000000001'),
 ('9f6d1000-0000-4000-8000-000000000002','audit B','9f6d0000-0000-4000-8000-000000000001');
insert into public.calendar_members(calendar_id,user_id) values
 ('9f6d1000-0000-4000-8000-000000000001','9f6d0000-0000-4000-8000-000000000002');
insert into public.events(id,calendar_id,title,start_at,end_at,created_by,rrule,rrule_until) values
 ('9f6d2000-0000-4000-8000-000000000001','9f6d1000-0000-4000-8000-000000000001','audit event',
  '2026-01-01T09:00:00Z','2026-01-01T10:00:00Z','9f6d0000-0000-4000-8000-000000000001','FREQ=DAILY;COUNT=1','2026-01-01T10:00:00Z');
insert into public.event_exceptions(event_id,original_start,type,start_at,end_at) values
 ('9f6d2000-0000-4000-8000-000000000001','2026-01-01T09:00:00Z','MODIFIED','2026-03-01T12:00:00Z','2026-03-01T13:00:00Z');
insert into public.event_reminders(event_id,minutes_before) values ('9f6d2000-0000-4000-8000-000000000001',10);
insert into public.calendar_invites(calendar_id,code,created_by) values
 ('9f6d1000-0000-4000-8000-000000000001','regression-deleted-invite','9f6d0000-0000-4000-8000-000000000001');
insert into public.attachments(id,calendar_id,event_id,storage_path,mime_type,size_bytes,uploaded_by) values
 ('9f6d3000-0000-4000-8000-000000000001','9f6d1000-0000-4000-8000-000000000001','9f6d2000-0000-4000-8000-000000000001',
  '9f6d1000-0000-4000-8000-000000000001/regression.pdf','application/pdf',1,'9f6d0000-0000-4000-8000-000000000001');

do $$ begin
  begin
    update public.events set calendar_id = '9f6d1000-0000-4000-8000-000000000002' where id = '9f6d2000-0000-4000-8000-000000000001';
    raise exception 'REGRESSION: attachment parent moved';
  exception when check_violation then null; end;
  begin
    insert into public.attachments(calendar_id,event_id,storage_path,mime_type,size_bytes,uploaded_by) values
      ('9f6d1000-0000-4000-8000-000000000002','9f6d2000-0000-4000-8000-000000000001',
       '9f6d1000-0000-4000-8000-000000000002/mismatch.pdf','application/pdf',1,'9f6d0000-0000-4000-8000-000000000001');
    raise exception 'REGRESSION: mismatched attachment accepted';
  exception when check_violation then null; end;
end; $$;
insert into storage.objects(bucket_id,name,owner_id) values
 ('calendar-media','9f6d1000-0000-4000-8000-000000000001/other-upload.pdf','9f6d0000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9f6d0000-0000-4000-8000-000000000002","is_anonymous":false}',true);
set local role authenticated;
do $$ begin
  begin
    insert into public.attachments(calendar_id,event_id,storage_path,mime_type,size_bytes,uploaded_by) values
      ('9f6d1000-0000-4000-8000-000000000001','9f6d2000-0000-4000-8000-000000000001',
       '9f6d1000-0000-4000-8000-000000000001/other-upload.pdf','application/pdf',1,'9f6d0000-0000-4000-8000-000000000002');
    raise exception 'REGRESSION: another uploader object claimed for cleanup';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.storage_cleanup_jobs(bucket_id,storage_path) values
 ('calendar-media','9f6d1000-0000-4000-8000-000000000001/regression.pdf');
select count(*) from public.claim_storage_cleanup(100);
select pg_temp.assert_true(exists(select 1 from public.storage_cleanup_jobs where storage_path = '9f6d1000-0000-4000-8000-000000000001/regression.pdf'
  and status = 'DONE' and last_error like 'Cleanup cancelled:%'), 'active attachment cancels old cleanup');
select set_config('request.jwt.claims','{}',true);
delete from public.attachments where id = '9f6d3000-0000-4000-8000-000000000001';
select pg_temp.assert_true(exists(select 1 from public.storage_cleanup_jobs
  where storage_path = '9f6d1000-0000-4000-8000-000000000001/regression.pdf' and status = 'PENDING'), 'delete retained cleanup path');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.storage_cleanup_jobs','select,insert,update,delete'), 'cleanup queue closed to authenticated');
select pg_temp.assert_true(not has_table_privilege('anon','public.storage_cleanup_jobs','select,insert,update,delete'), 'cleanup queue closed to anon');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.begin_notification_delivery(bigint,text)','execute'), 'send RPC closed to clients');
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_storage_cleanup(integer)','execute'), 'cleanup RPC closed to anon');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert_true(exists(select 1 from public.reminder_scan_candidates('2026-03-01T11:49:00Z','2026-03-01T11:51:00Z') j
  where j->'event'->>'id' = '9f6d2000-0000-4000-8000-000000000001'), 'moved exception outside master range remains reminder candidate');

insert into public.device_tokens(user_id,expo_token,platform) values
 ('9f6d0000-0000-4000-8000-000000000002','ExponentPushToken[backend-regression]','ios');
insert into public.notification_outbox(user_id,type,dedup_key,payload,status) values
 ('9f6d0000-0000-4000-8000-000000000002','EVENT_UPDATED','backend-regression-delivery',
  '{"calendar_id":"9f6d1000-0000-4000-8000-000000000001","event_id":"9f6d2000-0000-4000-8000-000000000001","actor_id":"9f6d0000-0000-4000-8000-000000000001"}', 'PROCESSING');
insert into public.notification_deliveries(outbox_id,expo_token)
 select id,'ExponentPushToken[backend-regression]' from public.notification_outbox where dedup_key = 'backend-regression-delivery';
select pg_temp.assert_true(public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'valid delivery begins');
select pg_temp.assert_true(exists(select 1 from public.notification_deliveries where expo_token = 'ExponentPushToken[backend-regression]'
 and status = 'SENDING' and sending_at is not null and attempts = 1), 'pre-send state is durable');
update public.notification_outbox set type = 'REMINDER', payload = payload ||
 '{"original_start":"2026-01-01T09:00:00Z","start_at":"2026-03-01T12:00:00Z","is_all_day":false,"minutes_before":10}'::jsonb
 where dedup_key = 'backend-regression-delivery';
update public.notification_deliveries set status = 'PENDING' where expo_token = 'ExponentPushToken[backend-regression]';
update public.event_exceptions set type = 'CANCELLED' where event_id = '9f6d2000-0000-4000-8000-000000000001';
select pg_temp.assert_true(not public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'cancelled reminder rejected at DB preflight');
update public.notification_deliveries set status = 'PENDING' where expo_token = 'ExponentPushToken[backend-regression]';
update public.event_exceptions set type = 'MODIFIED', start_at = '2026-03-01T14:00:00Z', end_at = '2026-03-01T15:00:00Z'
 where event_id = '9f6d2000-0000-4000-8000-000000000001';
select pg_temp.assert_true(not public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'moved reminder rejected at DB preflight');
update public.notification_outbox set type = 'EVENT_UPDATED' where dedup_key = 'backend-regression-delivery';
update public.notification_deliveries set status = 'PENDING' where expo_token = 'ExponentPushToken[backend-regression]';
update public.device_tokens set user_id = '9f6d0000-0000-4000-8000-000000000003' where expo_token = 'ExponentPushToken[backend-regression]';
select pg_temp.assert_true(not public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'transferred token rejected');
update public.notification_deliveries set status = 'PENDING' where expo_token = 'ExponentPushToken[backend-regression]';
update public.device_tokens set user_id = '9f6d0000-0000-4000-8000-000000000002' where expo_token = 'ExponentPushToken[backend-regression]';
update public.calendar_members set muted = true where calendar_id = '9f6d1000-0000-4000-8000-000000000001' and user_id = '9f6d0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'newly muted recipient rejected');
update public.notification_deliveries set status = 'PENDING' where expo_token = 'ExponentPushToken[backend-regression]';
delete from public.calendar_members where calendar_id = '9f6d1000-0000-4000-8000-000000000001' and user_id = '9f6d0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.begin_notification_delivery((select id from public.notification_outbox where dedup_key = 'backend-regression-delivery'),
 'ExponentPushToken[backend-regression]'), 'departed recipient rejected');

-- A real Storage object is not created by this rollback-only metadata fixture.
insert into storage.objects(bucket_id,name) values
 ('calendar-media','9f6d1000-0000-4000-8000-000000000001/covers/regression.png'),
 ('avatars','9f6d0000-0000-4000-8000-000000000003/regression.png');
delete from public.calendar_members where calendar_id = '9f6d1000-0000-4000-8000-000000000001';
select pg_temp.assert_true(exists(select 1 from public.calendars where id = '9f6d1000-0000-4000-8000-000000000001' and deleted_at is not null), 'last departure soft deletes calendar');
select pg_temp.assert_true(exists(select 1 from public.calendar_invites where code = 'regression-deleted-invite' and revoked_at is not null), 'last departure revokes invite');
select pg_temp.assert_true(exists(select 1 from public.storage_cleanup_jobs where storage_path = '9f6d1000-0000-4000-8000-000000000001/covers/regression.png'), 'calendar removal queued cover');
-- Even a stale membership row must not restore a deleted calendar's access.
insert into public.calendar_members(calendar_id,user_id) values
 ('9f6d1000-0000-4000-8000-000000000001','9f6d0000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9f6d0000-0000-4000-8000-000000000002","is_anonymous":false}',true);
set local role authenticated;
select pg_temp.assert_true(not public.is_calendar_member('9f6d1000-0000-4000-8000-000000000001'), 'stale membership does not open deleted calendar');
select pg_temp.assert_true(not exists(select 1 from public.events where id = '9f6d2000-0000-4000-8000-000000000001'), 'stale member cannot read event');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9f6d0000-0000-4000-8000-000000000003","is_anonymous":false}',true);
set local role authenticated;
select pg_temp.assert_true((public.invite_preview('regression-deleted-invite')->>'valid')::boolean = false, 'deleted invite not previewable');
do $$ begin
  begin perform public.accept_invite('regression-deleted-invite'); raise exception 'REGRESSION: deleted invite accepted';
  exception when no_data_found then null; end;
end; $$;
select pg_temp.assert_true(not public.can_access_event('9f6d2000-0000-4000-8000-000000000001'), 'deleted calendar event inaccessible');
select pg_temp.assert_true(not exists(select 1 from public.events where id = '9f6d2000-0000-4000-8000-000000000001'), 'deleted calendar RLS hides event');
reset role;
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id = '9f6d0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(exists(select 1 from public.storage_cleanup_jobs where bucket_id = 'avatars'
  and storage_path = '9f6d0000-0000-4000-8000-000000000003/regression.png'), 'deleted account queued only owned avatar path');
-- Deleting an author must preserve shared files, including soft-deleted events;
-- FK SET NULL must not rerun the INSERT parent/ownership guard.
insert into public.events(id,calendar_id,title,start_at,end_at,created_by) values
 ('9f6d2000-0000-4000-8000-000000000002','9f6d1000-0000-4000-8000-000000000002','shared',
  '2026-01-01T09:00:00Z','2026-01-01T10:00:00Z','9f6d0000-0000-4000-8000-000000000002');
insert into public.attachments(calendar_id,event_id,storage_path,mime_type,size_bytes,uploaded_by) values
 ('9f6d1000-0000-4000-8000-000000000002','9f6d2000-0000-4000-8000-000000000002',
  '9f6d1000-0000-4000-8000-000000000002/shared.pdf','application/pdf',1,'9f6d0000-0000-4000-8000-000000000002');
update public.events set deleted_at = now() where id = '9f6d2000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9f6d0000-0000-4000-8000-000000000002","is_anonymous":false}',true);
select public.delete_my_account();
select pg_temp.assert_true(exists(select 1 from public.attachments where storage_path = '9f6d1000-0000-4000-8000-000000000002/shared.pdf'
 and uploaded_by is null), 'account deletion preserves shared attachment');
select pg_temp.assert_true(not exists(select 1 from public.storage_cleanup_jobs where storage_path = '9f6d1000-0000-4000-8000-000000000002/shared.pdf'), 'shared file not queued when author leaves');
select 'Backend regression assertions passed; rolling back all fixtures' as result;
rollback;
