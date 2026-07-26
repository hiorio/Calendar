# 타 서비스 캘린더 가져오기 — 설계

Google · Apple · 네이버 등에서 쓰던 일정을 이 앱으로 끌고 오는 기능.

설계안 2차 백로그에는 "Google/Apple 캘린더 **표시**(기기 캘린더 read 연동)"로 적혀 있었지만,
요구가 "가져와서 적용"이므로 **표시가 아니라 우리 `events`로 복사**하는 쪽으로 잡는다.
차이가 큰 결정이라 아래 3장에 따로 정리한다.

> 상태: **설계만 됨. 구현 없음.** 스키마도 아직 넣지 않았다 (5장 이유 참고).

---

## 1. 경로는 세 가지고, 성격이 전혀 다르다

"연동"을 한 덩어리로 보면 안 된다. 실제로는 난이도와 커버리지가 다른 세 방식이다.

### (a) 기기 캘린더 읽기 — `expo-calendar`

OS의 캘린더 저장소를 직접 읽는다. 사용자가 이미 기기 설정에 Google·Apple·네이버 계정을
붙여 뒀다면 **한 번에 전부** 읽힌다.

- 장점: OAuth 없음. 공급자별 구현이 필요 없음. **네이버까지 공짜로 커버**된다.
  권한 요청 한 번이면 끝이라 사용자 경험도 가장 짧다.
- 단점: 읽는 시점의 스냅샷이다. 지속 동기화하려면 앱이 주기적으로 다시 읽어야 한다.
  웹에서는 못 쓴다. 기기에 계정이 안 붙어 있으면 아무것도 없다.
- 반복 일정: iOS/Android 모두 전개된 인스턴스를 주는 쪽이 다루기 쉽지만, RRULE 원본을
  가져올 수 있으면 그대로 `events.rrule`에 넣는 편이 낫다. 확인 필요.

### (b) ICS(iCalendar) URL 구독

Google의 비공개 iCal 주소, Apple의 공개 캘린더 링크, 네이버 캘린더 내보내기 URL을 받아
서버(Edge Function)가 주기적으로 내려받아 파싱한다.

- 장점: 계정 연결 없이 된다. 웹에서도 된다. 서버가 하므로 앱이 꺼져 있어도 갱신된다.
- 단점: 단방향 읽기. 갱신 지연(공급자가 캐시한다). URL이 유출되면 일정이 전부 노출되므로
  **URL 자체를 비밀로 취급**해야 한다.
- 파서를 우리가 만들어야 한다. VEVENT / RRULE / EXDATE / VTIMEZONE / 종일(DATE) 처리까지.
  4단계의 RRULE 모듈과 규칙을 공유해야 결과가 어긋나지 않는다.

### (c) 공급자 API 직접 연동 (OAuth)

- **Google Calendar API** — 읽기/쓰기, `syncToken` 기반 증분 동기화, `watch`로 변경 푸시까지
  된다. 셋 중 유일하게 "진짜 양방향 동기화"가 가능한 경로다.
- **Apple** — 공개 REST API가 없다. iCloud CalDAV + 앱 암호(app-specific password)를
  사용자에게 입력받는 방식이라 UX가 나쁘다. 사실상 (a)로 대체하는 게 맞다.
- **네이버** — **확인 필요.** 네이버 캘린더 오픈API는 오래 전부터 일정 *등록* 위주였고
  조회가 열려 있지 않은 것으로 알고 있는데, 이건 기억에 의존한 서술이라 그대로 믿으면 안
  된다. 착수 전에 네이버 개발자센터 현행 문서로 "일정 조회 가능 여부"를 반드시 확인할 것.
  읽기가 없으면 네이버는 (a) 또는 (b)로만 가능하다.

## 2. 권장 순서

1. **(a) 기기 캘린더 가져오기** — 투자 대비 커버리지가 압도적이다. Google·Apple·네이버가
   한 번에 해결되고 공급자 심사도 필요 없다.
2. **(b) ICS URL 구독** — 웹 사용자와 "기기에 계정을 안 붙인 사람"을 메운다.
   파서는 순수 함수 모듈 + 유닛 테스트로 만든다 (4단계 RRULE 모듈과 같은 규칙 사용).
3. **(c) Google API** — 양방향/실시간이 필요해질 때. OAuth 동의화면 심사가 필요하므로
   일정을 넉넉히 잡는다.

## 3. 가져온 일정을 어떻게 저장할까 — 복사 vs 오버레이

| | 복사 (우리 events에 insert) | 오버레이 (읽기 전용 표시) |
|---|---|---|
| 공유 | 구성원 모두가 본다 | 가져온 본인만 본다 |
| 댓글·리마인더 | 붙는다 | 못 붙인다 |
| 원본 변경 | 재동기화로 반영해야 함 | 항상 최신 |
| 충돌 | 우리 쪽 수정 vs 원본 수정 | 없음 |

**복사를 택한다.** "끌고 온다"는 요구가 공유를 전제하고, 일정=대화 스레드라는 이 앱의 핵심
가치가 오버레이에서는 성립하지 않는다.

대신 출처를 반드시 남긴다.

- `events.external_source_id`, `events.external_uid` — 재동기화 시 **upsert 키**
- `unique (calendar_id, external_source_id, external_uid)` — 재실행해도 중복이 안 생긴다
- `events.external_dirty` — 우리 쪽에서 수정한 일정은 재동기화가 덮어쓰지 않는다.
  조용한 덮어쓰기 금지 원칙(설계안 7.3)의 연장이다.

## 4. 스키마 초안

```sql
create type external_source_type as enum ('DEVICE', 'ICS', 'GOOGLE');

create table external_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        external_source_type not null,
  label       text not null,            -- 사용자에게 보이는 이름
  -- ICS URL이나 토큰 같은 비밀은 여기 평문으로 두지 않는다.
  -- Vault 또는 Edge Function 전용 테이블로 분리한다.
  secret_ref  text,
  last_synced_at timestamptz,
  last_error  text,
  created_at  timestamptz not null default now()
);

-- 소스 안의 개별 캘린더 → 우리 캘린더로의 매핑
create table external_calendar_links (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references external_sources(id) on delete cascade,
  external_id   text not null,          -- 공급자 쪽 캘린더 식별자
  external_name text,
  calendar_id   uuid not null references calendars(id) on delete cascade,
  enabled       boolean not null default true,
  unique (source_id, external_id)
);

alter table events
  add column external_source_id uuid references external_sources(id) on delete set null,
  add column external_uid text,
  add column external_dirty boolean not null default false;

create unique index idx_events_external
  on events (calendar_id, external_source_id, external_uid)
  where external_uid is not null;
```

## 5. 아직 스키마를 넣지 않은 이유

전부 **nullable 컬럼 추가와 신규 테이블**이라 나중에 붙여도 비용이 같다. 설계안이
"스키마는 처음에 고정하라"고 한 것은 `events`의 시간 컬럼처럼 **기존 데이터를 마이그레이션해야
하는 것**을 말한다. 쓰지도 않는 테이블을 미리 만들어 두면 실제 구현 때 어차피 고치게 된다.

## 6. 착수 전에 확인할 것

- [ ] 네이버 캘린더 오픈API에 **일정 조회**가 있는가 (현행 문서 확인)
- [ ] `expo-calendar`가 반복 규칙을 RRULE 원본으로 주는가, 전개된 인스턴스로 주는가
- [ ] 기기 캘린더의 종일 일정이 설계안 3장 원칙(date 컬럼)과 어긋나지 않게 매핑되는가
- [ ] 가져온 일정이 수백~수천 건일 때의 초기 삽입 성능과 화면 반응
- [ ] 개인 일정을 공유 캘린더에 넣는 것에 대한 사용자 고지 — 실수로 전부 공개되면 사고다
