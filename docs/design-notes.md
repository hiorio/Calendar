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

## 8. 세션 저장소

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
