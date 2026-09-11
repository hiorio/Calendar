-- 캘린더 설정 변경을 활동 로그에서 구분한다.
--
-- enum 값은 추가된 트랜잭션이 끝난 뒤에야 안전하게 사용할 수 있으므로,
-- 실제 트리거는 다음 마이그레이션 파일에서 만든다.

alter type public.activity_type
  add value if not exists 'CALENDAR_UPDATED';
