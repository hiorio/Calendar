# 설계안 대비 변경점

설계안(공유 캘린더 앱 상세 설계안)을 구현하면서 **바꾼 것**과 **왜 바꿨는지**를 모아둡니다.
설계 문서 자체는 그대로 두고, 실제 스키마와의 차이를 여기서 추적합니다.

---

## 1. `events.range_start` / `range_end` 추가 (중요)

**문제.** 설계안 6.1의 기간 조회 조건은 `start_at`을 기준으로 합니다.

```sql
(rrule is null and start_at < :to and end_at > :from)
or
(rrule is not null and start_at < :to and (rrule_until is null or rrule_until > :from))
```

그런데 3장 원칙에 따라 **종일 일정은 `start_at`이 NULL**입니다(`start_date`만 씀).
즉 위 조건으로는 종일 일정이 한 건도 잡히지 않습니다. "매년 5월 3일 생일" 같은
종일 + 반복 조합은 흔하기 때문에 이건 그냥 버그가 됩니다.

**해결.** 조회/인덱스 전용 파생 컬럼 두 개를 트리거(`sync_event_range`)로 유지합니다.

| 컬럼 | 값 |
|---|---|
| `range_start` | 시간 지정이면 `start_at`, 종일이면 `start_date`를 `events.timezone`으로 환산한 시각 |
| `range_end` | 단일 일정이면 종료 시각(종일은 마지막 날 +1일 00:00, **배타적**), 반복이면 `rrule_until`. NULL이면 무한 반복 |

`start_at` / `start_date`는 설계안 그대로 유지합니다. 파생 컬럼은 **직접 쓰지 않습니다.**

**바뀐 조회 조건:**

```sql
select * from events
where calendar_id in (:calendar_ids)
  and deleted_at is null
  and range_start < :to
  and (range_end is null or range_end > :from);
```

단일/반복/종일이 한 조건으로 처리되고 `idx_events_calendar_range`를 그대로 탑니다.

## 2. `rrule_until`의 의미를 고정

설계안은 "UNTIL 값 복제"라고만 되어 있는데, `COUNT=10` 처럼 UNTIL이 없는 규칙에서는
복제할 값이 없습니다. 그대로 두면 유한 반복이 무한으로 취급됩니다.

**규칙:** `rrule_until`에는 **마지막 회차의 종료 시각**을 넣습니다.

- `UNTIL`이 있으면 그 회차의 종료 시각
- `COUNT`가 있으면 전개해서 마지막 회차의 종료 시각
- 둘 다 없으면 NULL (무한)

4단계에서 만들 RRULE 순수 함수 모듈이 이 값을 계산해 저장합니다.

## 3. `event_exceptions` 보강

- `start_date` / `end_date` 오버라이드 컬럼 추가 — 종일 반복 일정의 한 회차만 수정하는 경우
- `created_at` / `updated_at` 추가 — 오프라인 큐 충돌 판정(7.3)에 필요
- `original_start` 규약 명시: **종일 반복 일정은 해당 날짜 00:00을 `events.timezone`으로
  환산한 값**을 씁니다. 클라이언트와 서버(`reminder/scan`)가 같은 규약을 써야 합니다.

## 4. 무결성 제약 보강

| 대상 | 내용 |
|---|---|
| `events` CHECK | 시간 컬럼과 날짜 컬럼이 **상호 배타**임을 강제. `end_at > start_at`, `end_date >= start_date` |
| `attachments` | `memo_id` FK 누락 보완, `event_id`/`comment_id`/`memo_id` 중 **정확히 하나**만 채우도록 CHECK, `storage_path` UNIQUE |
| `event_reminders` | `(event_id, user_id, minutes_before)` UNIQUE (`nulls not distinct` — 공통 리마인더 중복 방지) |
| `calendars` | `deleted_at` 추가 — 5.3의 "마지막 1인이 나가면 soft delete"가 스키마에 없었음 |
| `calendar_invites` | `revoked_at` 추가 |
| `device_tokens` | `disabled_at` 추가 — 12장의 stale token 정리용 |
| `notification_outbox` | `attempts`, `last_error` 추가 — 8.2의 "최대 3회 재시도"를 기록할 자리가 없었음 |

## 5. 구성원 규칙을 정책이 아니라 트리거로

RLS 정책만으로는 "본인이 자기 role을 OWNER로 올리는 것"이나 "OWNER가 소유권을 넘기지 않고
탈퇴하는 것"을 막을 수 없습니다(정책은 행 접근 여부만 판단하고 값 변화는 못 봅니다).
`20260726000200_membership_rules.sql`의 트리거가 담당합니다.

- 소유권 이전은 현 OWNER만, 새 소유자는 구성원이어야 함, `calendar_members.role`도 함께 이동
- 역할 변경은 OWNER만
- OWNER는 다른 구성원이 있으면 탈퇴 불가
- 마지막 1인이 나가면 캘린더 soft delete

`auth.uid()`가 NULL인 경우(= service_role로 도는 Edge Function)는 통과시킵니다.
서버 로직이 자체 검증합니다.

## 6. `calendar_members`에 클라이언트 INSERT 정책 없음

가입은 초대 코드 검증을 거쳐야 하는데, 비구성원은 `calendar_invites`를 읽을 수 없습니다
(읽을 수 있게 하면 코드 목록이 새어 나갑니다). 따라서 **합류는 반드시 `invite/accept`
Edge Function(service_role)을 통해서만** 일어납니다. 2단계 구현 시 전제입니다.

같은 이유로 `profiles` 조회는 "나 자신 + 같은 캘린더 구성원"으로 제한했습니다.
초대 링크 미리보기에서 캘린더 이름·구성원을 보여주려면 그것도 Edge Function이 내려줘야 합니다.

## 7. Storage

- `calendar-media` (비공개): 경로 `{calendar_id}/{uuid}.{ext}`, 첫 세그먼트로 구성원 검사
- `avatars` (공개 읽기): 경로 `{user_id}/{uuid}.{ext}`

설계안에 없던 `avatars`를 추가했습니다. `profiles.avatar_url`이 채워지려면 어딘가에는
올려야 합니다.

## 8. RLS만으로는 부족하다 — GRANT가 먼저다 (실행하며 발견)

`authenticated`에게 테이블 권한을 주지 않아 **모든 요청이 42501로 막혔습니다.**
RLS는 GRANT 위에 얹히는 필터라, GRANT가 없으면 정책이 무엇이든 통과하지 못합니다.

Supabase의 `public` 스키마 기본 권한은 `authenticated`에게 `Dxtm`(TRUNCATE, REFERENCES,
TRIGGER, MAINTAIN)만 주고 SELECT/INSERT/UPDATE/DELETE는 주지 않습니다. `service_role`도
같은 상태여서 Edge Function도 전부 막힙니다.

`20260726000500_grants.sql`에서 명시적으로 부여합니다. 부여 목록은 0003의 정책 목록과
1:1로 맞췄습니다. **새 테이블을 추가하면 이 파일도 함께 갱신해야 합니다.**

## 9. 캘린더 생성 시 RETURNING이 막히던 문제 (실행하며 발견)

`calendars`에 INSERT하면 `new row violates row-level security policy`가 났습니다.
RETURNING 없이 INSERT하면 성공하는 것으로 원인이 확인됐습니다.

PostgREST는 삽입 결과를 돌려주려고 항상 RETURNING을 붙이고(= supabase-js의
`.insert().select()`), PostgreSQL은 RETURNING 행에 SELECT 정책을 적용합니다. 그런데
OWNER 구성원 행을 만드는 `on_calendar_created`는 **AFTER INSERT** 트리거라 그 시점엔
아직 실행되지 않았고, 따라서 `is_calendar_member(id)`가 false였습니다.

`20260726000600_fix_calendar_insert_returning.sql`에서 SELECT 정책에
`owner_id = auth.uid()`를 더했습니다. 의미상으로도 소유자는 구성원 행과 무관하게 자기
캘린더를 봐야 하고, 소유권 이전 시 `owner_id`가 함께 바뀌므로 권한이 남지 않습니다.

> 교훈: "행을 만든 뒤에야 볼 수 있게 되는" 정책은 INSERT ... RETURNING과 충돌합니다.
> 앞으로 정책을 쓸 때 삽입 직후의 가시성을 항상 같이 확인할 것.

## 10. 가입을 시작 조건에서 뺐다 (설계안 10장 변경)

설계안 1차 범위는 "회원가입/로그인"이 첫 관문이었습니다. 앱을 처음 켠 사람에게 가입부터
요구하면 이탈이 큽니다. 캘린더에 일정 하나 적어보는 것까지는 계정이 없어도 됩니다.

**바꾼 것:** Supabase 익명 로그인으로 게스트 세션을 발급해 바로 시작합니다.
가입은 계정이 실제로 필요해지는 순간(공유)에만 요구합니다.

- 첫 실행 → `signInAnonymously()`. 로그인 화면을 거치지 않습니다.
- 게스트도 캘린더·일정·메모를 만들 수 있습니다. 스키마와 RLS는 그대로입니다.
  익명 사용자도 JWT의 `role`은 `authenticated`이기 때문입니다.
- 가입은 `/account` **모달**입니다. 설정 탭이나 게이트에 걸린 기능에서 엽니다.
- 게스트 → 계정은 `updateUser({ email, password })`로 **연결**합니다. `user.id`가 그대로라
  지금까지 쓴 데이터가 유지됩니다. 소셜은 `linkIdentity()`.
- 이미 있는 계정으로 **로그인**하면 게스트 기록은 따라오지 않습니다. 화면에서 경고합니다.

### 어디서 가입을 요구하는가

"공유"가 경계입니다. 초대 링크 발급에 계정을 요구하고, 이걸 **RLS로 강제**합니다
(`0007_guest_first.sql`). UI에서만 막으면 anon key로 우회됩니다.

```sql
create policy "invites: signed-up member can create" on public.calendar_invites
  for insert to authenticated
  with check (... and not public.is_guest());
```

`is_guest()`는 JWT의 `is_anonymous` 클레임을 봅니다.

### 함정: 계정이 돼도 토큰은 한동안 게스트다

`updateUser()`로 계정을 만들어도 **들고 있던 access token의 `is_anonymous`는 여전히
true**입니다. 갱신될 때까지(기본 1시간) `is_guest()`가 true라 공유가 계속 막힙니다.
`createAccount()`에서 `refreshSession()`을 명시적으로 호출합니다.
(`npm run db:smoke`의 12번 항목이 이 동작을 고정합니다.)

### 빈 게스트 계정 정리

서버가 진짜 계정 행을 발급하는 방식(Supabase 익명 로그인, Firebase Anonymous Auth)에서는
설치·재설치·스토리지 삭제·봇 요청마다 계정이 하나씩 남습니다. 두 곳 다 주기적 정리를
권고하는 표준 관리 항목입니다.

우리 스키마에서는 이게 자연히 안전합니다. `calendars.owner_id → profiles(id)`에 cascade가
없어서 **데이터를 가진 게스트는 FK가 삭제를 막습니다.** 즉 아래 배치가 지울 수 있는 건
아무것도 만들지 않은 빈 계정뿐입니다.

```sql
-- pg_cron으로 하루 1회. 필요해지면 마이그레이션으로 추가한다.
delete from auth.users
 where is_anonymous
   and created_at < now() - interval '30 days';
```

지금 넣지 않은 이유: 아직 사용자가 없어 정리할 것도 없고, 보관 기간(30일이 맞는지)은
실제 사용 패턴을 보고 정해야 합니다.

**미해결:** 캘린더를 만들고 방치한 게스트의 데이터는 영구 보존됩니다. 이건 기술이 아니라
보관 정책 결정입니다.

### 남은 것

- 게스트 상태로 앱을 지우면 데이터가 사라집니다. 화면에서 고지합니다.
- 2차: 이미 계정이 있는 사람이 게스트로 쓰던 내용을 **병합**하는 흐름.
  지금은 병합하지 않고 경고만 합니다.

## 11. 세션 저장소

Supabase 세션을 `AsyncStorage`에 둡니다(Supabase의 Expo 가이드 기본값).
`expo-secure-store`는 안드로이드에서 2048바이트 제한이 있어 세션 JSON을 그대로 담기
어렵습니다. 토큰을 OS 보안 저장소에 두려면 청크 분할 어댑터가 필요합니다 — **하드닝 항목으로
남겨둡니다.**

---

## 아직 결정하지 않은 것

- `following` 분할 시 새 마스터의 `created_by`를 원 작성자로 둘지, 분할한 사람으로 둘지
- 반복 일정의 회차별 참여자/리마인더 오버라이드 (현재는 마스터 단위만)
- 댓글을 회차가 아니라 마스터에 붙이는 선택(설계안 6.3)의 UX 검증 — 매주 반복 회의에서
  지난주 회차 대화가 이번 주에도 그대로 보입니다
