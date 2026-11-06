-- =============================================================================
-- 한 Expo push token은 한 사용자에게만 속한다.
--
-- 세션 만료나 앱 종료가 계정 전환과 겹치면 클라이언트가 이전 user_id 행을
-- RLS로 더는 지울 수 없다. 토큰을 실제로 가진 현재 설치가 그 토큰 하나만
-- 원자적으로 다시 청구할 수 있게 한다.
-- =============================================================================

-- 과거 클라이언트가 같은 토큰을 여러 계정에 남겼다면 가장 최근의 활성 행만
-- 보존한다. 현재 운영 DB에는 중복도 활성 토큰도 없지만 다른 환경의 안전한
-- migration을 위해 정리 절차를 포함한다.
with ranked_tokens as (
  select
    ctid,
    row_number() over (
      partition by expo_token
      order by (disabled_at is null) desc, updated_at desc, user_id
    ) as position
  from public.device_tokens
)
delete from public.device_tokens as token
using ranked_tokens as ranked
where token.ctid = ranked.ctid
  and ranked.position > 1;

create unique index device_tokens_expo_token_key
  on public.device_tokens (expo_token);

create function public.claim_device_token(
  p_expo_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_expo_token is null or length(p_expo_token) < 1 or length(p_expo_token) > 512 then
    raise exception 'invalid expo push token' using errcode = '22023';
  end if;

  if p_platform not in ('ios', 'android') then
    raise exception 'invalid push platform' using errcode = '22023';
  end if;

  insert into public.device_tokens (
    user_id,
    expo_token,
    platform,
    updated_at,
    disabled_at
  )
  values (
    v_user_id,
    p_expo_token,
    p_platform,
    now(),
    null
  )
  on conflict (expo_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = excluded.updated_at,
      disabled_at = null;
end;
$$;

revoke all on function public.claim_device_token(text, text)
  from public, anon;
grant execute on function public.claim_device_token(text, text)
  to authenticated;
