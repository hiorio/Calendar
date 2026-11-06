-- =============================================================================
-- 원격 알림 워커 스케줄러
--
-- Edge Function만 배포하면 outbox claim과 리마인더 스캔이 한 번도
-- 실행되지 않는다. Supabase 권장 구성대로 pg_cron에서 pg_net을 통해
-- notification-worker를 1분마다 호출한다.
--
-- 실제 URL과 키는 migration에 넣지 않고 Vault의 아래 이름을 실행 시점에
-- 읽는다. 로컬 reset처럼 세 값 중 하나라도 없으면 HTTP 요청을 만들지
-- 않으므로 외부 환경을 잘못 울리지 않는다.
--   - project_url
--   - publishable_key
--   - notification_worker_secret
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'notification-worker-every-minute',
  '* * * * *',
  $worker$
    with worker_secrets as (
      select
        max(decrypted_secret) filter (where name = 'project_url') as project_url,
        max(decrypted_secret) filter (where name = 'publishable_key') as publishable_key,
        max(decrypted_secret) filter (where name = 'notification_worker_secret') as worker_secret
      from vault.decrypted_secrets
    )
    select net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/notification-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', publishable_key,
        'x-worker-secret', worker_secret
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    )
    from worker_secrets
    where project_url is not null
      and publishable_key is not null
      and worker_secret is not null;
  $worker$
);

-- enqueue_notifications는 트리거의 SECURITY DEFINER 함수에서만 호출한다.
-- PUBLIC EXECUTE를 남겨 두면 클라이언트가 RPC로 임의 payload를 큐에
-- 넣을 수 있다. 같은 경계의 트리거 함수도 외부 실행 권한을 회수한다.
revoke all on function public.enqueue_notifications(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.on_event_change_notify()
  from public, anon, authenticated;
revoke all on function public.on_comment_notify()
  from public, anon, authenticated;
revoke all on function public.on_exception_notify()
  from public, anon, authenticated;
