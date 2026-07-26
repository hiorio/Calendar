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

/** RPC 호출 (security definer 함수) */
async function rpc(token, fn, args) {
  return rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
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
console.log('\n14. 소유권 이전과 탈퇴 규칙 (설계안 5.3)');
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

  const last = await rest(
    bob.token,
    `calendar_members?calendar_id=eq.${calendarId}&user_id=eq.${bob.userId}`,
    { method: 'DELETE' },
  );
  check('마지막 1인은 나갈 수 있다', last.status === 200, `status=${last.status}`);

  const gone = await rest(bob.token, `calendars?select=id&id=eq.${calendarId}`);
  check('마지막 1인이 나가면 캘린더가 soft delete 된다', gone.body?.length === 0, JSON.stringify(gone.body));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
