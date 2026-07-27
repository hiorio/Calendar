/**
 * 로컬 Supabase 스모크 테스트.
 *
 *   npm run db:start && npm run db:smoke
 *
 * 앱이 실제로 쓰는 경로(GoTrue + PostgREST + anon key)로만 접근해서
 * RLS 정책과 트리거가 의도대로 도는지 확인합니다.
 *
 * 예외가 하나 있습니다 — `notification_outbox`는 클라이언트에 완전히 닫혀 있어서
 * (정책 없음 + 권한 회수) anon key로는 들여다볼 방법이 자체가 없습니다. 그 섹션만
 * 발송 워커와 같은 경로인 service_role로 읽습니다. 로컬 키라 밖으로 나가지 않습니다.
 *
 * 테스트 사용자를 실제로 만듭니다. 로컬 DB에만 쓰세요.
 * 되돌리려면 `npm run db:reset`.
 */
import { execFileSync } from 'node:child_process';

const status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const env = new Map(
  status
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const URL_BASE = env.get('API_URL');
const ANON = env.get('ANON_KEY') ?? env.get('PUBLISHABLE_KEY');
/** 알림 큐 확인 전용. 앱은 이 키를 쓰지 않는다. */
const SERVICE_ROLE = env.get('SERVICE_ROLE_KEY') ?? env.get('SECRET_KEY');

if (!URL_BASE || !ANON) {
  console.error('supabase status에서 API_URL / ANON_KEY를 찾지 못했습니다. db:start 먼저.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

async function signUp(nickname) {
  const email = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'smoke-test-1234';

  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { nickname } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`signup 실패 (${res.status}): ${JSON.stringify(body)}`);

  let token = body.access_token;
  let userId = body.user?.id ?? body.id;

  // 이메일 확인이 켜져 있으면 signup이 세션을 주지 않는다
  if (!token) {
    const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await login.json();
    if (!login.ok) {
      throw new Error(
        `로그인 실패 (${login.status}): ${JSON.stringify(loginBody)}\n` +
          'config.toml의 auth.email.enable_confirmations를 false로 두세요.',
      );
    }
    token = loginBody.access_token;
    userId = loginBody.user?.id;
  }

  return { email, token, userId };
}

/** 가입 없이 시작하는 게스트 세션 (supabase-js의 signInAnonymously와 같은 엔드포인트) */
async function signInAnonymously() {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`익명 로그인 실패 (${res.status}): ${JSON.stringify(body)}`);
  return {
    token: body.access_token,
    refreshToken: body.refresh_token,
    userId: body.user?.id,
    isAnonymous: body.user?.is_anonymous,
  };
}

/** GoTrue PUT /user — 게스트에 이메일/비밀번호를 붙인다 */
async function updateUser(token, payload) {
  const res = await fetch(`${URL_BASE}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`토큰 갱신 실패 (${res.status}): ${JSON.stringify(body)}`);
  return { token: body.access_token, refreshToken: body.refresh_token, user: body.user };
}

/** access token의 is_anonymous 클레임 */
function claims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/** PostgREST 호출. { status, body } 반환 */
async function rest(token, path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** RPC 호출 (security definer 함수) */
async function rpc(token, fn, args) {
  return rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

/**
 * 알림 큐 읽기. 발송 워커가 하는 것과 같은 방식이다.
 * notification_outbox는 클라이언트에 닫혀 있어 다른 경로가 없다.
 */
async function outbox(query) {
  const res = await fetch(`${URL_BASE}/rest/v1/notification_outbox?${query}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  return res.ok ? res.json() : [];
}

console.log(`대상: ${URL_BASE}\n`);

// ---------------------------------------------------------------------------
console.log('1. 가입과 프로필 자동 생성');
const alice = await signUp('앨리스');
const bob = await signUp('밥');

{
  const { body } = await rest(alice.token, 'profiles?select=id,nickname');
  check(
    'handle_new_user 트리거가 profiles를 만든다',
    Array.isArray(body) && body.length === 1 && body[0].id === alice.userId,
    JSON.stringify(body),
  );
  check('닉네임이 user_metadata에서 넘어온다', body?.[0]?.nickname === '앨리스', JSON.stringify(body));
}

// ---------------------------------------------------------------------------
console.log('\n2. 캘린더 생성과 OWNER 자동 등록');
let calendarId;
{
  const { status, body } = await rest(alice.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '스모크 캘린더', owner_id: alice.userId }),
  });
  calendarId = body?.[0]?.id;
  check('구성원은 캘린더를 만들 수 있다', status === 201 && Boolean(calendarId), `${status} ${JSON.stringify(body)}`);

  const members = await rest(alice.token, `calendar_members?select=role&calendar_id=eq.${calendarId}`);
  check(
    'on_calendar_created 트리거가 OWNER 행을 넣는다',
    members.body?.length === 1 && members.body[0].role === 'OWNER',
    JSON.stringify(members.body),
  );
}

{
  const { status } = await rest(bob.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '남의 것', owner_id: alice.userId }),
  });
  check('남을 owner로 지정한 캘린더 생성은 막힌다', status === 403 || status === 401, `status=${status}`);
}

// ---------------------------------------------------------------------------
console.log('\n3. 캘린더 격리 (RLS)');
{
  const { body } = await rest(bob.token, 'calendars?select=id');
  check('비구성원에게는 캘린더가 보이지 않는다', Array.isArray(body) && body.length === 0, JSON.stringify(body));
}
{
  const { status, body } = await rest(bob.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '침입',
      start_at: '2026-08-01T10:00:00+09:00',
      end_at: '2026-08-01T11:00:00+09:00',
      created_by: bob.userId,
    }),
  });
  check('비구성원은 일정을 넣을 수 없다', status === 403 || status === 401, `${status} ${JSON.stringify(body)}`);
}
{
  const { body } = await rest(bob.token, `profiles?select=id&id=eq.${alice.userId}`);
  check('같은 캘린더가 아니면 프로필도 안 보인다', Array.isArray(body) && body.length === 0, JSON.stringify(body));
}

// ---------------------------------------------------------------------------
console.log('\n4. 시간 지정 일정과 range 파생 컬럼');
{
  const { status, body } = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '팀 회의',
      start_at: '2026-08-01T10:00:00+09:00',
      end_at: '2026-08-01T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const row = body?.[0];
  check('구성원은 일정을 넣을 수 있다', status === 201 && Boolean(row), `${status} ${JSON.stringify(body)}`);
  check(
    'range_start = start_at',
    row && new Date(row.range_start).toISOString() === new Date('2026-08-01T10:00:00+09:00').toISOString(),
    `range_start=${row?.range_start}`,
  );
  check(
    'range_end = end_at (단일 일정)',
    row && new Date(row.range_end).toISOString() === new Date('2026-08-01T11:00:00+09:00').toISOString(),
    `range_end=${row?.range_end}`,
  );
}

// ---------------------------------------------------------------------------
console.log('\n5. 종일 + 반복 일정 (설계안 6.1이 놓쳤던 조합)');
{
  const { status, body } = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '생일',
      is_all_day: true,
      start_date: '2026-08-03',
      end_date: '2026-08-03',
      timezone: 'Asia/Seoul',
      rrule: 'FREQ=YEARLY',
      created_by: alice.userId,
    }),
  });
  const row = body?.[0];
  check('종일 반복 일정이 들어간다', status === 201 && Boolean(row), `${status} ${JSON.stringify(body)}`);
  check(
    'range_start이 이벤트 타임존 자정으로 채워진다',
    row && new Date(row.range_start).toISOString() === new Date('2026-08-03T00:00:00+09:00').toISOString(),
    `range_start=${row?.range_start}`,
  );
  check('무한 반복이면 range_end는 NULL', row ? row.range_end === null : false, `range_end=${row?.range_end}`);

  // 끝이 있는 반복은 range_end가 rrule_until을 따라간다. 클라이언트가
  // rrule_until을 채워 보내면(lib/recurrence.ts) 트리거가 그대로 옮긴다.
  const bounded = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '4주 스터디',
      start_at: '2026-08-04T10:00:00+09:00',
      end_at: '2026-08-04T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      rrule: 'FREQ=WEEKLY;UNTIL=20260825T235900Z',
      rrule_until: '2026-08-25T02:00:00.000Z',
      created_by: alice.userId,
    }),
  });
  check(
    '끝이 있는 반복은 range_end = rrule_until',
    new Date(bounded.body?.[0]?.range_end).toISOString() === '2026-08-25T02:00:00.000Z',
    `${bounded.status} range_end=${bounded.body?.[0]?.range_end}`,
  );

  // 설계안 6.1의 원래 조건(start_at 기준)이라면 여기서 0건이 나온다
  const from = '2026-08-01T00:00:00+09:00';
  const to = '2026-09-01T00:00:00+09:00';
  const found = await rest(
    alice.token,
    `events?select=title&deleted_at=is.null&range_start=lt.${encodeURIComponent(to)}` +
      `&or=(range_end.is.null,range_end.gt.${encodeURIComponent(from)})`,
  );
  const titles = Array.isArray(found.body) ? found.body.map((e) => e.title) : [];
  check(
    '기간 조회가 시간지정·종일반복을 모두 잡는다',
    titles.includes('팀 회의') && titles.includes('생일'),
    JSON.stringify(found.body),
  );
}

// ---------------------------------------------------------------------------
console.log('\n6. 시간 컬럼 제약');
{
  const { status } = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '잘못된 종일',
      is_all_day: true,
      start_date: '2026-08-03',
      end_date: '2026-08-03',
      start_at: '2026-08-03T10:00:00+09:00',
      end_at: '2026-08-03T11:00:00+09:00',
      created_by: alice.userId,
    }),
  });
  check('종일 일정에 start_at을 같이 넣으면 거부된다', status === 400, `status=${status}`);
}

// ---------------------------------------------------------------------------
console.log('\n7. 구성원 설정');
{
  const { status } = await rest(alice.token, `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ muted: true }),
  });
  check('본인 알림 설정은 바꿀 수 있다', status === 200, `status=${status}`);

  // 되돌린다. 켜 둔 채로 두면 뒤에 오는 알림 검사가 조용히 통과해 버린다
  // (음소거된 사람에게는 아무것도 안 쌓이므로 "알림이 간다"를 확인할 수 없다).
  await rest(alice.token, `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ muted: false }),
  });
}

// ---------------------------------------------------------------------------
console.log('\n8. 초대 링크와 합류 (설계안 6.2)');
const inviteCode = `smoke-${Date.now()}`;
{
  const created = await rest(alice.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: calendarId, code: inviteCode, created_by: alice.userId }),
  });
  check('구성원은 초대 링크를 만들 수 있다', created.status === 201, `${created.status} ${JSON.stringify(created.body)}`);

  const leaked = await rest(bob.token, 'calendar_invites?select=code');
  check('비구성원에게 초대 코드 목록은 보이지 않는다', leaked.body?.length === 0, JSON.stringify(leaked.body));

  const preview = await rpc(bob.token, 'invite_preview', { invite_code: inviteCode });
  check(
    '비구성원도 초대 미리보기는 볼 수 있다',
    preview.body?.valid === true && preview.body?.calendar_name === '스모크 캘린더',
    JSON.stringify(preview.body),
  );
  check('미리보기에 초대한 사람이 나온다', preview.body?.inviter === '앨리스', JSON.stringify(preview.body));

  const accepted = await rpc(bob.token, 'accept_invite', { invite_code: inviteCode });
  check(
    '초대를 수락하면 합류된다',
    accepted.status === 200 && accepted.body?.already_member === false,
    `${accepted.status} ${JSON.stringify(accepted.body)}`,
  );

  const again = await rpc(bob.token, 'accept_invite', { invite_code: inviteCode });
  check('두 번 수락해도 중복 가입되지 않는다', again.body?.already_member === true, JSON.stringify(again.body));

  const counted = await rest(alice.token, `calendar_invites?select=use_count&code=eq.${inviteCode}`);
  check('use_count는 한 번만 오른다', counted.body?.[0]?.use_count === 1, JSON.stringify(counted.body));

  const cals = await rest(bob.token, 'calendars?select=id');
  check('합류하면 캘린더가 보인다', cals.body?.length === 1, JSON.stringify(cals.body));

  // 개수로 세지 않는다. 앞 섹션에 일정을 하나 더 넣으면 그때마다 깨진다.
  const events = await rest(bob.token, 'events?select=title');
  const titles = Array.isArray(events.body) ? events.body.map((e) => e.title) : [];
  check(
    '합류하면 기존 일정도 보인다',
    titles.includes('팀 회의') && titles.includes('생일'),
    JSON.stringify(events.body),
  );

  const profiles = await rest(bob.token, `profiles?select=nickname&id=eq.${alice.userId}`);
  check('같은 캘린더면 상대 프로필이 보인다', profiles.body?.[0]?.nickname === '앨리스', JSON.stringify(profiles.body));

  const activity = await rest(alice.token, `activity_logs?select=type&calendar_id=eq.${calendarId}`);
  check(
    'MEMBER_JOINED 활동로그가 남는다',
    Array.isArray(activity.body) && activity.body.some((a) => a.type === 'MEMBER_JOINED'),
    JSON.stringify(activity.body),
  );
}

console.log('\n8-1. 못 쓰는 초대 링크');
{
  const deadCode = `dead-${Date.now()}`;
  await rest(alice.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      code: deadCode,
      created_by: alice.userId,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    }),
  });

  const preview = await rpc(bob.token, 'invite_preview', { invite_code: deadCode });
  check('만료된 링크는 미리보기에서 걸린다', preview.body?.reason === 'EXPIRED', JSON.stringify(preview.body));

  const missing = await rpc(bob.token, 'invite_preview', { invite_code: 'no-such-code' });
  check('없는 코드는 NOT_FOUND', missing.body?.reason === 'NOT_FOUND', JSON.stringify(missing.body));

  const attempt = await rpc(bob.token, 'accept_invite', { invite_code: deadCode });
  check('만료된 링크로는 수락되지 않는다', attempt.status >= 400, `${attempt.status} ${JSON.stringify(attempt.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n9. 알림 큐는 클라이언트에게 닫혀 있다');
{
  const { body } = await rest(alice.token, 'notification_outbox?select=id');
  // 권한 자체가 없거나(42501), 있더라도 정책이 없어 0건이거나 — 둘 다 통과
  const blocked = body?.code === '42501' || (Array.isArray(body) && body.length === 0);
  check('notification_outbox는 클라이언트에게 닫혀 있다', blocked, JSON.stringify(body));
}

// ---------------------------------------------------------------------------
console.log('\n10. 게스트로 시작하기 (가입 없이 사용)');
let guest;
{
  guest = await signInAnonymously();
  check('가입 없이 세션이 발급된다', Boolean(guest.token && guest.userId), JSON.stringify(guest));
  check('익명 사용자로 표시된다', guest.isAnonymous === true, `is_anonymous=${guest.isAnonymous}`);

  const profile = await rest(guest.token, 'profiles?select=nickname');
  check('게스트에게도 프로필이 생긴다', profile.body?.[0]?.nickname === '나', JSON.stringify(profile.body));
}

let guestCalendarId;
{
  const created = await rest(guest.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '게스트 캘린더', owner_id: guest.userId }),
  });
  guestCalendarId = created.body?.[0]?.id;
  check('게스트도 캘린더를 만들 수 있다', created.status === 201 && Boolean(guestCalendarId), `${created.status} ${JSON.stringify(created.body)}`);

  const event = await rest(guest.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: guestCalendarId,
      title: '게스트 일정',
      start_at: '2026-08-05T09:00:00+09:00',
      end_at: '2026-08-05T10:00:00+09:00',
      created_by: guest.userId,
    }),
  });
  check('게스트도 일정을 넣을 수 있다', event.status === 201, `${event.status} ${JSON.stringify(event.body)}`);
}

console.log('\n11. 공유는 계정이 있어야 한다');
{
  const invite = await rest(guest.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: guestCalendarId,
      code: `guest-${Date.now()}`,
      created_by: guest.userId,
    }),
  });
  check('게스트는 초대 링크를 만들 수 없다', invite.status === 403, `${invite.status} ${JSON.stringify(invite.body)}`);

  const preview = await rpc(guest.token, 'invite_preview', { invite_code: inviteCode });
  check('게스트도 초대 미리보기는 볼 수 있다', preview.body?.valid === true, JSON.stringify(preview.body));

  const accepted = await rpc(guest.token, 'accept_invite', { invite_code: inviteCode });
  check('게스트는 초대를 수락할 수 없다', accepted.status >= 400, `${accepted.status} ${JSON.stringify(accepted.body)}`);
}

console.log('\n12. 게스트 → 계정 (데이터 유지)');
{
  const email = `upgraded-${Date.now()}@example.com`;
  const upgraded = await updateUser(guest.token, { email, password: 'smoke-test-1234' });
  check('게스트에 이메일·비밀번호를 붙일 수 있다', upgraded.status === 200, `${upgraded.status} ${JSON.stringify(upgraded.body)}`);
  check('user.id가 그대로다 (= 데이터 유지)', upgraded.body?.id === guest.userId, `${upgraded.body?.id} vs ${guest.userId}`);

  // 계정이 된 뒤에도 이전 토큰의 is_anonymous 클레임은 true다. 갱신해야 반영된다.
  check('갱신 전 토큰은 여전히 게스트 클레임', claims(guest.token).is_anonymous === true);

  const fresh = await refreshSession(guest.refreshToken);
  check('토큰을 갱신하면 게스트가 아니다', claims(fresh.token).is_anonymous === false, JSON.stringify(claims(fresh.token).is_anonymous));

  const cals = await rest(fresh.token, 'calendars?select=name');
  check('게스트 때 만든 캘린더가 그대로 보인다', cals.body?.some((c) => c.name === '게스트 캘린더'), JSON.stringify(cals.body));

  const events = await rest(fresh.token, 'events?select=title');
  check('게스트 때 만든 일정도 그대로다', events.body?.some((e) => e.title === '게스트 일정'), JSON.stringify(events.body));

  const invite = await rest(fresh.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: guestCalendarId,
      code: `upgraded-${Date.now()}`,
      created_by: guest.userId,
    }),
  });
  check('계정이 되면 초대 링크를 만들 수 있다', invite.status === 201, `${invite.status} ${JSON.stringify(invite.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n13. 일정 수정과 삭제 (3단계)');
{
  const created = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '치과',
      start_at: '2026-08-10T14:00:00+09:00',
      end_at: '2026-08-10T15:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const eventId = created.body?.[0]?.id;
  check('일정이 만들어진다', created.status === 201 && Boolean(eventId), `${created.status} ${JSON.stringify(created.body)}`);

  // 공유 캘린더의 일정은 만든 사람만의 것이 아니다. 구성원이면 고칠 수 있어야 한다.
  const edited = await rest(bob.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: '치과 (시간 변경)', start_at: '2026-08-10T16:00:00+09:00', end_at: '2026-08-10T17:00:00+09:00' }),
  });
  check('다른 구성원도 일정을 고칠 수 있다', edited.status === 200, `${edited.status} ${JSON.stringify(edited.body)}`);
  check(
    '수정하면 range_start도 따라 움직인다',
    new Date(edited.body?.[0]?.range_start).toISOString() === new Date('2026-08-10T16:00:00+09:00').toISOString(),
    `range_start=${edited.body?.[0]?.range_start}`,
  );

  const outsider = await rest(bob.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '밥 혼자 캘린더', owner_id: bob.userId }),
  });
  const bobOnlyCalendar = outsider.body?.[0]?.id;

  // 앨리스는 밥의 개인 캘린더 구성원이 아니다. 거기로 옮기는 것은 WITH CHECK에 걸려야 한다.
  const moved = await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ calendar_id: bobOnlyCalendar }),
  });
  check('내가 못 보는 캘린더로는 일정을 옮길 수 없다', moved.status >= 400, `${moved.status} ${JSON.stringify(moved.body)}`);

  // 삭제는 행을 지우지 않고 deleted_at을 채운다 (설계안 4.2)
  const deleted = await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('일정 삭제는 soft delete로 처리된다', deleted.status === 200, `${deleted.status} ${JSON.stringify(deleted.body)}`);

  // 앱이 실제로 쓰는 기간 조회 (features/events/queries.ts와 같은 조건)
  const from = '2026-08-01T00:00:00+09:00';
  const to = '2026-09-01T00:00:00+09:00';
  const listed = await rest(
    alice.token,
    `events?select=title&deleted_at=is.null&range_start=lt.${encodeURIComponent(to)}` +
      `&or=(range_end.is.null,range_end.gt.${encodeURIComponent(from)})`,
  );
  const titles = Array.isArray(listed.body) ? listed.body.map((e) => e.title) : [];
  check('삭제한 일정은 기간 조회에서 빠진다', !titles.includes('치과 (시간 변경)'), JSON.stringify(titles));
}

{
  // 종일 일정의 range_end는 "마지막 날 다음 날 00:00"(배타적)이다.
  // 화면이 칩을 며칠에 찍을지 이 규칙 위에서 계산한다 (lib/event-time.ts).
  const { body } = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '여름 휴가',
      is_all_day: true,
      start_date: '2026-08-14',
      end_date: '2026-08-16',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  check(
    '종일 일정의 range_end는 마지막 날 다음 자정',
    new Date(body?.[0]?.range_end).toISOString() === new Date('2026-08-17T00:00:00+09:00').toISOString(),
    `range_end=${body?.[0]?.range_end}`,
  );

  const bad = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '거꾸로',
      start_at: '2026-08-10T15:00:00+09:00',
      end_at: '2026-08-10T14:00:00+09:00',
      created_by: alice.userId,
    }),
  });
  check('종료가 시작보다 앞서면 거부된다', bad.status === 400, `status=${bad.status}`);
}

// ---------------------------------------------------------------------------
console.log('\n14. 참여자와 댓글 (5단계)');
{
  const outsider = await signUp('구경꾼');

  const created = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '집들이',
      start_at: '2026-08-22T18:00:00+09:00',
      end_at: '2026-08-22T21:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const eventId = created.body?.[0]?.id;

  // --- 참여자 -------------------------------------------------------------
  const joined = await rest(alice.token, 'event_participants', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: bob.userId }),
  });
  check('구성원은 다른 구성원을 참여자로 넣을 수 있다', joined.status === 201, `${joined.status} ${JSON.stringify(joined.body)}`);

  const seen = await rest(bob.token, `event_participants?select=user_id&event_id=eq.${eventId}`);
  check('참여자 목록이 구성원에게 보인다', seen.body?.[0]?.user_id === bob.userId, JSON.stringify(seen.body));

  const intruder = await rest(outsider.token, 'event_participants', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: outsider.userId }),
  });
  check('비구성원은 참여자로 끼어들 수 없다', intruder.status >= 400, `${intruder.status} ${JSON.stringify(intruder.body)}`);

  // --- 댓글 ---------------------------------------------------------------
  const comment = await rest(bob.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: bob.userId, content: '뭐 사갈까?' }),
  });
  const commentId = comment.body?.[0]?.id;
  check('구성원은 댓글을 쓸 수 있다', comment.status === 201 && Boolean(commentId), `${comment.status} ${JSON.stringify(comment.body)}`);

  const impersonated = await rest(bob.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: alice.userId, content: '앨리스인 척' }),
  });
  check('남의 이름으로는 댓글을 쓸 수 없다', impersonated.status >= 400, `${impersonated.status} ${JSON.stringify(impersonated.body)}`);

  const leaked = await rest(outsider.token, `event_comments?select=content&event_id=eq.${eventId}`);
  check('비구성원에게는 댓글이 보이지 않는다', leaked.body?.length === 0, JSON.stringify(leaked.body));

  // 삭제는 작성자 본인만. 앨리스는 캘린더 OWNER지만 밥의 댓글은 못 지운다.
  const otherDelete = await rest(alice.token, `event_comments?id=eq.${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  const stillThere = await rest(alice.token, `event_comments?select=deleted_at&id=eq.${commentId}`);
  check(
    '남의 댓글은 지울 수 없다',
    stillThere.body?.[0]?.deleted_at === null,
    `${otherDelete.status} ${JSON.stringify(stillThere.body)}`,
  );

  // event_comments에는 DELETE 권한을 주지 않았다 (0005). 대화 흐름을 남긴다.
  const hardDelete = await rest(bob.token, `event_comments?id=eq.${commentId}`, { method: 'DELETE' });
  check('댓글은 하드 삭제할 수 없다', hardDelete.status >= 400, `status=${hardDelete.status}`);

  const softDelete = await rest(bob.token, `event_comments?id=eq.${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('본인 댓글은 soft delete 된다', softDelete.status === 200, `${softDelete.status} ${JSON.stringify(softDelete.body)}`);

  const listed = await rest(alice.token, `event_comments?select=id&event_id=eq.${eventId}&deleted_at=is.null`);
  check('지운 댓글은 목록에서 빠진다', listed.body?.length === 0, JSON.stringify(listed.body));

  // --- 앱이 실제로 쓰는 임베드 쿼리 --------------------------------------
  // comment_reactions가 event_comments와 profiles 사이의 정션이라, 그냥
  // `profiles(...)`로 묻으면 PostgREST가 300 Multiple Choices를 돌려준다.
  // 화면이 통째로 비는 버그라 여기서 고정한다.
  const ambiguous = await rest(alice.token, `event_comments?select=id,profiles(nickname)&event_id=eq.${eventId}`);
  check('경로가 둘이라 profiles 임베드는 모호하다', ambiguous.status === 300, `status=${ambiguous.status}`);

  const hinted = await rest(alice.token, `event_comments?select=id,profiles!user_id(nickname)&event_id=eq.${eventId}`);
  check('컬럼을 지정하면 작성자 프로필이 붙는다', hinted.status === 200, `${hinted.status} ${JSON.stringify(hinted.body)}`);

  const withParticipants = await rest(
    alice.token,
    `event_participants?select=user_id,profiles(nickname)&event_id=eq.${eventId}`,
  );
  check(
    '참여자 프로필 임베드는 모호하지 않다',
    withParticipants.status === 200 && withParticipants.body?.[0]?.profiles?.nickname === '밥',
    `${withParticipants.status} ${JSON.stringify(withParticipants.body)}`,
  );
}

// ---------------------------------------------------------------------------
console.log('\n15. 알림 큐 (6단계)');
{
  // 앨리스와 밥이 같은 캘린더에 있다. 앨리스가 움직이면 밥에게 알림이 쌓여야 한다.
  const created = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '장보기',
      start_at: '2026-08-30T10:00:00+09:00',
      end_at: '2026-08-30T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const eventId = created.body?.[0]?.id;

  // 개수로 세지 않는다. 앞 섹션도 일정을 만들어 큐에 쌓여 있다.
  // dedup_key가 '{사건}:{event_id}:{수신자}' 꼴이라 정확히 짚을 수 있다.
  const createdKey = `EVENT_CREATED:${eventId}:${bob.userId}`;
  const forBob = await outbox(`dedup_key=eq.${createdKey}&select=payload`);
  check('일정을 만들면 다른 구성원 앞으로 알림이 쌓인다', forBob.length === 1, JSON.stringify(forBob));
  check('페이로드에 캘린더와 일정 정보가 들어 있다',
    forBob[0]?.payload?.title === '장보기' && forBob[0]?.payload?.calendar_name === '스모크 캘린더',
    JSON.stringify(forBob[0]?.payload));

  const forSelf = await outbox(`dedup_key=eq.EVENT_CREATED:${eventId}:${alice.userId}&select=id`);
  check('내 행동은 나에게 알리지 않는다', forSelf.length === 0, JSON.stringify(forSelf));

  // --- 수정 / 삭제 --------------------------------------------------------
  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: '장보기 (마트 변경)' }),
  });
  const updated = await outbox(`user_id=eq.${bob.userId}&type=eq.EVENT_UPDATED&dedup_key=like.*${eventId}*&select=id`);
  check('제목을 바꾸면 알림이 간다', updated.length === 1, JSON.stringify(updated));

  // 메모만 고치는 것은 남을 깨울 일이 아니다
  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: '우유, 계란' }),
  });
  const afterMemo = await outbox(`user_id=eq.${bob.userId}&type=eq.EVENT_UPDATED&dedup_key=like.*${eventId}*&select=id`);
  check('메모만 고치면 알림이 가지 않는다', afterMemo.length === 1, JSON.stringify(afterMemo));

  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  const deleted = await outbox(`dedup_key=eq.EVENT_DELETED:${eventId}:${bob.userId}&select=id`);
  check('삭제도 알림이 간다', deleted.length === 1, JSON.stringify(deleted));

  // --- 댓글 ---------------------------------------------------------------
  const live = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '주말 나들이',
      start_at: '2026-09-05T10:00:00+09:00',
      end_at: '2026-09-05T12:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const liveId = live.body?.[0]?.id;

  const posted = await rest(bob.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: liveId, user_id: bob.userId, content: '몇 시에 만날까?' }),
  });
  const commentId = posted.body?.[0]?.id;

  const commentForAlice = await outbox(`dedup_key=eq.COMMENT:${commentId}:${alice.userId}&select=payload`);
  check('댓글은 캘린더의 다른 구성원에게 간다', commentForAlice.length === 1, JSON.stringify(commentForAlice));
  check('댓글 알림에 발췌가 들어 있다',
    commentForAlice[0]?.payload?.excerpt === '몇 시에 만날까?',
    JSON.stringify(commentForAlice[0]?.payload));

  const commentForBob = await outbox(`dedup_key=eq.COMMENT:${commentId}:${bob.userId}&select=id`);
  check('내 댓글은 나에게 알리지 않는다', commentForBob.length === 0, JSON.stringify(commentForBob));

  // --- 음소거 -------------------------------------------------------------
  await rest(bob.token, `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ muted: true }),
  });

  await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '조용히 추가',
      start_at: '2026-09-07T10:00:00+09:00',
      end_at: '2026-09-07T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });

  const afterMute = await outbox(`user_id=eq.${bob.userId}&type=eq.EVENT_CREATED&select=payload`);
  const mutedTitles = afterMute.map((row) => row.payload?.title);
  check('음소거한 사람에게는 알림이 쌓이지 않는다', !mutedTitles.includes('조용히 추가'), JSON.stringify(mutedTitles));

  await rest(bob.token, `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ muted: false }),
  });

  // --- 큐는 여전히 클라이언트에 닫혀 있다 ---------------------------------
  const peek = await rest(alice.token, 'notification_outbox?select=id');
  check('구성원도 알림 큐를 직접 읽을 수 없다', peek.status >= 400 || peek.body?.length === 0, `${peek.status} ${JSON.stringify(peek.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n16. 리마인더 (6단계)');
{
  const created = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '병원',
      start_at: '2026-09-10T10:00:00+09:00',
      end_at: '2026-09-10T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const eventId = created.body?.[0]?.id;

  const mine = await rest(alice.token, 'event_reminders', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: alice.userId, minutes_before: 60 }),
  });
  check('내 리마인더를 걸 수 있다', mine.status === 201, `${mine.status} ${JSON.stringify(mine.body)}`);

  const forOther = await rest(alice.token, 'event_reminders', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: bob.userId, minutes_before: 60 }),
  });
  check('남의 리마인더는 걸 수 없다', forOther.status >= 400, `${forOther.status} ${JSON.stringify(forOther.body)}`);

  const dup = await rest(alice.token, 'event_reminders', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: alice.userId, minutes_before: 60 }),
  });
  check('같은 리마인더는 두 번 걸리지 않는다', dup.status === 409, `${dup.status} ${JSON.stringify(dup.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n17. 기기 토큰 (6단계)');
{
  const registered = await rest(alice.token, 'device_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: alice.userId,
      expo_token: 'ExponentPushToken[smoke-alice]',
      platform: 'ios',
    }),
  });
  check('내 기기 토큰을 등록할 수 있다', registered.status === 201, `${registered.status} ${JSON.stringify(registered.body)}`);

  const spoofed = await rest(alice.token, 'device_tokens', {
    method: 'POST',
    body: JSON.stringify({
      user_id: bob.userId,
      expo_token: 'ExponentPushToken[spoof]',
      platform: 'ios',
    }),
  });
  check('남의 기기 토큰은 등록할 수 없다', spoofed.status >= 400, `${spoofed.status} ${JSON.stringify(spoofed.body)}`);

  const others = await rest(bob.token, 'device_tokens?select=expo_token');
  check('남의 토큰은 보이지 않는다', others.body?.length === 0, JSON.stringify(others.body));
}

// ---------------------------------------------------------------------------
console.log('\n18. 활동 로그 (7단계)');
{
  const created = await rest(alice.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: calendarId,
      title: '이사',
      start_at: '2026-09-20T09:00:00+09:00',
      end_at: '2026-09-20T18:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: alice.userId,
    }),
  });
  const eventId = created.body?.[0]?.id;

  const logs = () => rest(alice.token, `activity_logs?select=type,actor_id,ref_id,summary&ref_id=eq.${eventId}&order=id`);

  let seen = await logs();
  check('일정을 만들면 활동이 남는다',
    seen.body?.[0]?.type === 'EVENT_CREATED' && seen.body?.[0]?.actor_id === alice.userId,
    JSON.stringify(seen.body));
  check('활동에 일정 이름이 들어 있다', seen.body?.[0]?.summary?.title === '이사', JSON.stringify(seen.body?.[0]));

  // 알림과 달리 **본인 행동도** 남는다. 기록과 알림은 다른 문제다.
  const notified = await outbox(`dedup_key=eq.EVENT_CREATED:${eventId}:${alice.userId}&select=id`);
  check('본인 행동은 알림엔 없지만 활동엔 남는다', notified.length === 0 && seen.body?.length === 1,
    `알림 ${notified.length}건 / 활동 ${seen.body?.length}건`);

  // 무엇을 바꿨는지 기록한다
  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ start_at: '2026-09-21T09:00:00+09:00', end_at: '2026-09-21T18:00:00+09:00' }),
  });
  seen = await logs();
  const updated = seen.body?.find((row) => row.type === 'EVENT_UPDATED');
  check('바뀐 항목이 기록된다', JSON.stringify(updated?.summary?.changed) === '["time"]', JSON.stringify(updated?.summary));

  // 알림은 가지 않지만 활동에는 남는 변화
  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: '트럭 예약함' }),
  });
  seen = await logs();
  const memoLog = seen.body?.filter((row) => row.type === 'EVENT_UPDATED') ?? [];
  check('메모만 고쳐도 활동엔 남는다',
    memoLog.some((row) => JSON.stringify(row.summary?.changed) === '["description"]'),
    JSON.stringify(memoLog.map((r) => r.summary?.changed)));

  // 댓글
  await rest(bob.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, user_id: bob.userId, content: '몇 시부터 도와줄까?' }),
  });
  seen = await logs();
  const comment = seen.body?.find((row) => row.type === 'COMMENT_CREATED');
  check('댓글도 활동에 남는다', comment?.actor_id === bob.userId, JSON.stringify(comment));
  check('댓글 활동에 발췌가 들어 있다', comment?.summary?.excerpt === '몇 시부터 도와줄까?', JSON.stringify(comment?.summary));

  // 삭제
  await rest(alice.token, `events?id=eq.${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  seen = await logs();
  check('삭제도 활동에 남는다', seen.body?.some((row) => row.type === 'EVENT_DELETED'), JSON.stringify(seen.body?.map((r) => r.type)));

  // 읽기 전용 — 쓰기 권한을 주지 않았다(0005)
  const forged = await rest(alice.token, 'activity_logs', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: calendarId, actor_id: bob.userId, type: 'EVENT_CREATED' }),
  });
  check('활동 로그는 직접 쓸 수 없다', forged.status >= 400, `${forged.status} ${JSON.stringify(forged.body)}`);

  const outsider = await signUp('활동 구경꾼');
  const leaked = await rest(outsider.token, 'activity_logs?select=id');
  check('비구성원에게는 활동이 보이지 않는다', leaked.body?.length === 0, JSON.stringify(leaked.body));

  // 앱이 실제로 쓰는 임베드 (작성자·캘린더 함께)
  const embedded = await rest(
    alice.token,
    `activity_logs?select=id,summary,profiles!actor_id(nickname),calendars(name,color)&calendar_id=eq.${calendarId}&order=id.desc&limit=1`,
  );
  check('작성자와 캘린더를 함께 가져올 수 있다',
    embedded.status === 200 && Boolean(embedded.body?.[0]?.profiles?.nickname && embedded.body?.[0]?.calendars?.name),
    `${embedded.status} ${JSON.stringify(embedded.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n19. 소유권 이전과 탈퇴 규칙 (설계안 5.3)');
{
  const blocked = await rest(
    alice.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`,
    { method: 'DELETE' },
  );
  check('다른 구성원이 있으면 OWNER는 나갈 수 없다', blocked.status >= 400, `${blocked.status} ${JSON.stringify(blocked.body)}`);

  const escalate = await rest(
    bob.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`,
    { method: 'PATCH', body: JSON.stringify({ role: 'OWNER' }) },
  );
  check('구성원이 스스로 OWNER가 될 수 없다', escalate.status >= 400, `${escalate.status} ${JSON.stringify(escalate.body)}`);

  const transferred = await rest(alice.token, `calendars?id=eq.${calendarId}`, {
    method: 'PATCH',
    body: JSON.stringify({ owner_id: bob.userId }),
  });
  check('OWNER는 소유권을 넘길 수 있다', transferred.status === 200, `${transferred.status} ${JSON.stringify(transferred.body)}`);

  const roles = await rest(alice.token, `calendar_members?select=user_id,role&calendar_id=eq.${calendarId}`);
  const roleOf = (id) => roles.body?.find((m) => m.user_id === id)?.role;
  check('넘긴 사람은 MEMBER가 된다', roleOf(alice.userId) === 'MEMBER', JSON.stringify(roles.body));
  check('받은 사람은 OWNER가 된다', roleOf(bob.userId) === 'OWNER', JSON.stringify(roles.body));

  const left = await rest(
    alice.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`,
    { method: 'DELETE' },
  );
  check('넘기고 나면 나갈 수 있다', left.status === 200, `status=${left.status}`);

  // 나간 사람은 더 이상 못 읽으니 남은 사람(밥)이 확인한다
  const leftLog = await rest(
    bob.token,
    `activity_logs?select=type,ref_id,summary&calendar_id=eq.${calendarId}&type=eq.MEMBER_LEFT`,
  );
  check('탈퇴가 활동에 남는다',
    leftLog.body?.some((row) => row.ref_id === alice.userId && row.summary?.nickname === '앨리스'),
    JSON.stringify(leftLog.body));
  check('스스로 나간 것은 강퇴가 아니다',
    leftLog.body?.find((row) => row.ref_id === alice.userId)?.summary?.kicked === false,
    JSON.stringify(leftLog.body));

  const last = await rest(
    bob.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`,
    { method: 'DELETE' },
  );
  check('마지막 1인은 나갈 수 있다', last.status === 200, `status=${last.status}`);

  const gone = await rest(bob.token, `calendars?select=id&id=eq.${calendarId}`);
  check('마지막 1인이 나가면 캘린더가 soft delete 된다', gone.body?.length === 0, JSON.stringify(gone.body));
}

// ---------------------------------------------------------------------------
console.log('\n20. 계정 삭제 (8단계)');
{
  // 지우는 사람(다나)과 남는 사람(에런)으로 새 판을 짠다.
  // 앞 섹션의 캘린더는 이미 정리돼서 쓸 수 없다.
  const dana = await signUp('다나');
  const erin = await signUp('에런');

  // (1) 함께 쓰는 캘린더 — 다나가 소유자, 에런이 구성원
  const shared = await rest(dana.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '함께 쓰는 것', owner_id: dana.userId }),
  });
  const sharedId = shared.body?.[0]?.id;

  const code = `del-${Date.now()}`;
  await rest(dana.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: sharedId, code, created_by: dana.userId }),
  });
  await rpc(erin.token, 'accept_invite', { invite_code: code });

  const sharedEvent = await rest(dana.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: sharedId,
      title: '다나가 만든 일정',
      start_at: '2026-10-01T10:00:00+09:00',
      end_at: '2026-10-01T11:00:00+09:00',
      timezone: 'Asia/Seoul',
      created_by: dana.userId,
    }),
  });
  const sharedEventId = sharedEvent.body?.[0]?.id;

  await rest(dana.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: sharedEventId, user_id: dana.userId, content: '제가 준비할게요' }),
  });

  // (2) 혼자 쓰는 캘린더
  const solo = await rest(dana.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '나만 보는 것', owner_id: dana.userId }),
  });
  const soloId = solo.body?.[0]?.id;

  // --- 미리보기 -----------------------------------------------------------
  const preview = await rpc(dana.token, 'account_deletion_preview', {});
  check('미리보기가 넘어갈 캘린더를 알려 준다',
    JSON.stringify(preview.body?.transferred) === '["함께 쓰는 것"]', JSON.stringify(preview.body));
  check('미리보기가 지워질 캘린더를 알려 준다',
    JSON.stringify(preview.body?.deleted) === '["나만 보는 것"]', JSON.stringify(preview.body));

  // --- 삭제 ---------------------------------------------------------------
  const deleted = await rpc(dana.token, 'delete_my_account', {});
  check('계정을 지울 수 있다', deleted.status === 200 || deleted.status === 204, `${deleted.status} ${JSON.stringify(deleted.body)}`);

  // --- 남은 사람 쪽에서 확인 ----------------------------------------------
  const erinCalendars = await rest(erin.token, 'calendars?select=id,name,owner_id');
  check('함께 쓰던 캘린더는 남는다',
    erinCalendars.body?.some((c) => c.id === sharedId), JSON.stringify(erinCalendars.body));
  check('소유권이 남은 구성원에게 넘어간다',
    erinCalendars.body?.find((c) => c.id === sharedId)?.owner_id === erin.userId,
    JSON.stringify(erinCalendars.body));
  check('혼자 쓰던 캘린더는 사라진다',
    !erinCalendars.body?.some((c) => c.id === soloId), JSON.stringify(erinCalendars.body));

  const roles = await rest(erin.token, `calendar_members?select=user_id,role&calendar_id=eq.${sharedId}`);
  check('넘겨받은 사람이 OWNER가 된다',
    roles.body?.length === 1 && roles.body[0].user_id === erin.userId && roles.body[0].role === 'OWNER',
    JSON.stringify(roles.body));

  // 남이 함께 보던 내용은 남고 작성자만 비워진다 (설계안 5.3과 같은 원칙)
  const events = await rest(erin.token, `events?select=title,created_by&id=eq.${sharedEventId}`);
  check('내가 만든 일정은 남는다', events.body?.[0]?.title === '다나가 만든 일정', JSON.stringify(events.body));
  check('일정의 작성자만 비워진다', events.body?.[0]?.created_by === null, JSON.stringify(events.body));

  const comments = await rest(erin.token, `event_comments?select=content,user_id&event_id=eq.${sharedEventId}`);
  check('내가 쓴 댓글도 남는다', comments.body?.[0]?.content === '제가 준비할게요', JSON.stringify(comments.body));
  check('댓글의 작성자만 비워진다', comments.body?.[0]?.user_id === null, JSON.stringify(comments.body));

  const profiles = await rest(erin.token, `profiles?select=id&id=eq.${dana.userId}`);
  check('프로필은 사라진다', profiles.body?.length === 0, JSON.stringify(profiles.body));

  // 로그인도 안 돼야 한다
  const relogin = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: dana.email, password: 'smoke-test-1234' }),
  });
  check('지운 계정으로는 로그인할 수 없다', relogin.status >= 400, `status=${relogin.status}`);
}

{
  // 게스트도 지울 수 있어야 한다. 가입을 요구하지 않는 앱이니 지우는 것도 그래야 한다.
  const ghost = await signInAnonymously();
  await rest(ghost.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '게스트가 만든 것', owner_id: ghost.userId }),
  });

  const gone = await rpc(ghost.token, 'delete_my_account', {});
  check('게스트도 계정을 지울 수 있다', gone.status === 200 || gone.status === 204, `${gone.status} ${JSON.stringify(gone.body)}`);

  const after = await rest(ghost.token, 'calendars?select=id');
  check('지운 뒤 토큰으로는 아무것도 안 보인다', after.status >= 400 || after.body?.length === 0, `${after.status} ${JSON.stringify(after.body)}`);
}

// ---------------------------------------------------------------------------
console.log('\n21. 컬럼 단위 권한 — UPDATE 우회 차단 (0013)');
{
  // 공격자와 피해자를 새로 만든다. 공격자는 피해자 캘린더의 구성원이 아니다.
  const victim = await signUp('피해자');
  const attacker = await signUp('공격자');

  const victimCal = await rest(victim.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '남의 캘린더', owner_id: victim.userId }),
  });
  const victimCalId = victimCal.body?.[0]?.id;

  const attackerCal = await rest(attacker.token, 'calendars', {
    method: 'POST',
    body: JSON.stringify({ name: '공격자 캘린더', owner_id: attacker.userId }),
  });
  const attackerCalId = attackerCal.body?.[0]?.id;

  // (1) 내 멤버십 행의 calendar_id를 남의 캘린더로 — 초대 우회
  const hop = await rest(
    attacker.token,
    `calendar_members?calendar_id=eq.${attackerCalId}&user_id=eq.${attacker.userId}`,
    { method: 'PATCH', body: JSON.stringify({ calendar_id: victimCalId }) },
  );
  check('멤버십의 calendar_id는 바꿀 수 없다', hop.status >= 400, `${hop.status} ${JSON.stringify(hop.body)}`);

  const peek = await rest(attacker.token, `calendars?select=id&id=eq.${victimCalId}`);
  check('그래서 남의 캘린더가 보이지 않는다', peek.body?.length === 0, JSON.stringify(peek.body));

  // (2) 내가 만든 초대를 남의 캘린더로 돌리기
  const code = `hop-${Date.now()}`;
  const inv = await rest(attacker.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: attackerCalId, code, created_by: attacker.userId }),
  });
  const invId = inv.body?.[0]?.id;
  const repoint = await rest(attacker.token, `calendar_invites?id=eq.${invId}`, {
    method: 'PATCH', body: JSON.stringify({ calendar_id: victimCalId }),
  });
  check('초대의 calendar_id는 바꿀 수 없다', repoint.status >= 400, `${repoint.status} ${JSON.stringify(repoint.body)}`);

  const revoke = await rest(attacker.token, `calendar_invites?id=eq.${invId}`, {
    method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  check('초대 취소는 그대로 된다', revoke.status === 200, `${revoke.status} ${JSON.stringify(revoke.body)}`);

  // (3) 구성원이 캘린더를 soft delete
  const nuke = await rest(attacker.token, `calendars?id=eq.${attackerCalId}`, {
    method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('구성원이 캘린더를 지울 수 없다', nuke.status >= 400, `${nuke.status} ${JSON.stringify(nuke.body)}`);

  const rename = await rest(attacker.token, `calendars?id=eq.${attackerCalId}`, {
    method: 'PATCH', body: JSON.stringify({ name: '이름 변경' }),
  });
  check('이름 변경은 그대로 된다', rename.status === 200, `${rename.status} ${JSON.stringify(rename.body)}`);

  // (4) 댓글을 남의 일정으로 옮기기
  const ev = await rest(attacker.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: attackerCalId, title: '내 일정',
      start_at: '2026-10-05T10:00:00+09:00', end_at: '2026-10-05T11:00:00+09:00',
      timezone: 'Asia/Seoul', created_by: attacker.userId,
    }),
  });
  const evId = ev.body?.[0]?.id;
  const cm = await rest(attacker.token, 'event_comments', {
    method: 'POST',
    body: JSON.stringify({ event_id: evId, user_id: attacker.userId, content: '내 댓글' }),
  });
  const cmId = cm.body?.[0]?.id;

  const move = await rest(attacker.token, `event_comments?id=eq.${cmId}`, {
    method: 'PATCH', body: JSON.stringify({ event_id: evId }),
  });
  check('댓글의 event_id는 바꿀 수 없다', move.status >= 400, `${move.status} ${JSON.stringify(move.body)}`);

  const softDel = await rest(attacker.token, `event_comments?id=eq.${cmId}`, {
    method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('본인 댓글 삭제는 그대로 된다', softDel.status === 200, `${softDel.status} ${JSON.stringify(softDel.body)}`);

  // (5) 일정의 작성자 위조
  const forge = await rest(attacker.token, `events?id=eq.${evId}`, {
    method: 'PATCH', body: JSON.stringify({ created_by: victim.userId }),
  });
  check('일정의 created_by는 바꿀 수 없다', forge.status >= 400, `${forge.status} ${JSON.stringify(forge.body)}`);

  const retitle = await rest(attacker.token, `events?id=eq.${evId}`, {
    method: 'PATCH', body: JSON.stringify({ title: '제목 변경' }),
  });
  check('일정 제목 변경은 그대로 된다', retitle.status === 200, `${retitle.status} ${JSON.stringify(retitle.body)}`);

  // (6) 프로필 id 위조
  const idSwap = await rest(attacker.token, `profiles?id=eq.${attacker.userId}`, {
    method: 'PATCH', body: JSON.stringify({ id: victim.userId }),
  });
  check('프로필 id는 바꿀 수 없다', idSwap.status >= 400, `${idSwap.status} ${JSON.stringify(idSwap.body)}`);

  const nick = await rest(attacker.token, `profiles?id=eq.${attacker.userId}`, {
    method: 'PATCH', body: JSON.stringify({ nickname: '새 이름' }),
  });
  check('닉네임 변경은 그대로 된다', nick.status === 200, `${nick.status} ${JSON.stringify(nick.body)}`);

  // (7) 음소거는 본인 것만
  await rest(victim.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: victimCalId, code: `join-${Date.now()}`, created_by: victim.userId }),
  });
  const joinCode = `join2-${Date.now()}`;
  await rest(victim.token, 'calendar_invites', {
    method: 'POST',
    body: JSON.stringify({ calendar_id: victimCalId, code: joinCode, created_by: victim.userId }),
  });
  await rpc(attacker.token, 'accept_invite', { invite_code: joinCode });

  // (8) 클라이언트는 회차 예외를 upsert 로 쓴다. PostgREST 의 upsert 는 충돌 키까지
  //     UPDATE 권한을 요구하므로, 컬럼을 좁히면 여기서 42501 이 난다.
  const recurring = await rest(attacker.token, 'events', {
    method: 'POST',
    body: JSON.stringify({
      calendar_id: attackerCalId, title: '매주 회의',
      start_at: '2026-11-03T10:00:00+09:00', end_at: '2026-11-03T11:00:00+09:00',
      timezone: 'Asia/Seoul', rrule: 'FREQ=WEEKLY', created_by: attacker.userId,
    }),
  });
  const recId = recurring.body?.[0]?.id;
  const occAt = '2026-11-10T01:00:00.000Z';

  // on_conflict 를 줘야 한다. PostgREST 의 기본 충돌 대상은 PK(id)라
  // 그냥 두면 unique (event_id, original_start) 에 걸려 23505 가 난다.
  const upsertOnce = await rest(attacker.token, 'event_exceptions?on_conflict=event_id,original_start', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      event_id: recId, original_start: occAt, type: 'MODIFIED',
      title: '이 주만 다른 제목', is_all_day: false,
      start_at: '2026-11-10T02:00:00.000Z', end_at: '2026-11-10T03:00:00.000Z',
      // 안 쓰는 쪽은 명시적으로 비운다. 클라이언트의 toTimeColumns 가 그렇게 보낸다 —
      // 빠뜨리면 upsert 가 옛 값을 남겨 at/date 가 섞인 행이 된다.
      start_date: null, end_date: null,
    }),
  });
  check('회차 예외 upsert 가 된다', upsertOnce.status === 201, `${upsertOnce.status} ${JSON.stringify(upsertOnce.body)}`);

  const upsertTwice = await rest(attacker.token, 'event_exceptions?on_conflict=event_id,original_start', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      event_id: recId, original_start: occAt, type: 'MODIFIED',
      title: '한 번 더 고침', is_all_day: true,
      start_date: '2026-11-10', end_date: '2026-11-10',
      start_at: null, end_at: null,
    }),
  });
  // 갱신으로 떨어지면 200, 새로 넣으면 201
  check('같은 회차를 다시 고치면 덮어쓴다',
    upsertTwice.status === 200 || upsertTwice.status === 201,
    `${upsertTwice.status} ${JSON.stringify(upsertTwice.body)}`);
  check(
    '회차만 종일로 바꾼 것이 저장된다 (0014)',
    upsertTwice.body?.[0]?.is_all_day === true && upsertTwice.body?.[0]?.title === '한 번 더 고침',
    JSON.stringify(upsertTwice.body?.[0]),
  );
  check(
    '종일로 바뀌면 시각 컬럼이 비워진다',
    upsertTwice.body?.[0]?.start_at === null && upsertTwice.body?.[0]?.end_at === null,
    JSON.stringify(upsertTwice.body?.[0]),
  );

  // 회차 수정도 다른 구성원에게 알림이 가고 활동에 남아야 한다 (0014)
  const occLog = await rest(attacker.token, `activity_logs?select=type,summary&ref_id=eq.${recId}&order=id`);
  check(
    '회차 수정이 활동에 남는다',
    occLog.body?.some((r) => r.summary?.occurrence !== undefined),
    JSON.stringify(occLog.body?.map((r) => r.type)),
  );

  const muteOther = await rest(
    attacker.token,
    `calendar_members?calendar_id=eq.${victimCalId}&user_id=eq.${victim.userId}`,
    { method: 'PATCH', body: JSON.stringify({ muted: true }) },
  );
  const victimStill = await rest(
    victim.token,
    `calendar_members?select=muted&calendar_id=eq.${victimCalId}&user_id=eq.${victim.userId}`,
  );
  check(
    '남의 음소거를 대신 켤 수 없다',
    victimStill.body?.[0]?.muted === false,
    `${muteOther.status} → muted=${victimStill.body?.[0]?.muted}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
