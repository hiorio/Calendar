-- =============================================================================
-- 알림 워커 전용 권한
--
-- service_role은 RLS를 우회하지만 SQL 권한 자체는 별도다. 클라이언트 역할에는 계속
-- 아무 권한도 주지 않고, Edge Function이 delivery와 outbox를 정리할 권한만 준다.
-- =============================================================================

grant select, insert, update, delete
  on public.notification_deliveries
  to service_role;

grant select, insert, update, delete
  on public.notification_outbox
  to service_role;
