/**
 * 로컬 Supabase 스모크 테스트.
 *
 *   npm run db:start && npm run db:smoke
 *
 * 앱이 실제로 쓰는 경로(GoTrue + PostgREST + anon key)로만 접근해서
 * RLS 정책과 트리거가 의도대로 도는지 확인합니다. service_role은 쓰지 않습니다.
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

/**
 * service_role로 호출. 초대 수락 Edge Function이 할 일을 대신할 때만 쓴다.
 * RLS를 우회하므로 검증에는 절대 쓰지 않는다.
 */
async function restAsService(path, init = {}) {
  const service = env.get('SERVICE_ROLE_KEY') ?? env.get('SECRET_KEY');
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
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
}

// ---------------------------------------------------------------------------
console.log('\n8. 합류 후 접근과 탈퇴 규칙 (5.3)');
{
  // 합류는 초대 수락 Edge Function(service_role)만 할 수 있다. 그 역할을 대신한다.
  const joined = await restAsService(`calendar_members`, {
    method: 'POST',
    body: JSON.stringify({ calendar_id: calendarId, user_id: bob.userId, role: 'MEMBER' }),
  });
  check('초대 수락(service_role)으로 합류시킬 수 있다', joined.status === 201, `${joined.status} ${JSON.stringify(joined.body)}`);

  const cals = await rest(bob.token, 'calendars?select=id');
  check('합류하면 캘린더가 보인다', cals.body?.length === 1, JSON.stringify(cals.body));

  const events = await rest(bob.token, 'events?select=title');
  check('합류하면 기존 일정도 보인다', events.body?.length === 2, JSON.stringify(events.body));

  const profiles = await rest(bob.token, `profiles?select=nickname&id=eq.${alice.userId}`);
  check('같은 캘린더면 상대 프로필이 보인다', profiles.body?.[0]?.nickname === '앨리스', JSON.stringify(profiles.body));
}
{
  const { status, body } = await rest(
    alice.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`,
    { method: 'DELETE' },
  );
  check(
    '다른 구성원이 있으면 OWNER는 나갈 수 없다',
    status >= 400,
    `${status} ${JSON.stringify(body)}`,
  );
}
{
  const { status } = await rest(
    bob.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`,
    { method: 'DELETE' },
  );
  check('MEMBER는 스스로 나갈 수 있다', status === 200, `status=${status}`);

  const alone = await rest(
    alice.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${alice.userId}`,
    { method: 'DELETE' },
  );
  check('마지막 1인은 나갈 수 있다', alone.status === 200, `status=${alone.status}`);

  const cals = await rest(alice.token, `calendars?select=id&id=eq.${calendarId}`);
  check('마지막 1인이 나가면 캘린더가 soft delete 된다', cals.body?.length === 0, JSON.stringify(cals.body));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
