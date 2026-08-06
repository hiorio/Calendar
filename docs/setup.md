# 개발 환경 설정

이 문서 하나만 따라 하면 **이 저장소를 처음 받은 사람(또는 AI 세션)이 같은 환경에서
개발을 이어가고 테스트할 수 있습니다.** 클라우드 Supabase 프로젝트나 별도 계정 없이
로컬에서 전부 돌아갑니다.

---

## 1. 필요한 것

| | 버전 | 왜 |
|---|---|---|
| **Node.js** | **24 LTS 권장** (최소 22.18) | `npm run test:unit`이 빌드 없이 `.ts`를 직접 실행합니다. Node가 타입을 스스로 벗겨내는 기능(기본 활성화가 22.18/23.6부터)이 필요합니다. 그 아래 버전에서는 이 명령만 실패합니다. |
| **Docker Desktop** | 실행 중 | 로컬 Supabase(Postgres · GoTrue · PostgREST · Storage)를 컨테이너로 띄웁니다. **Docker가 꺼져 있으면 `db:start`가 실패합니다.** |
| **npm** | 10+ | Node에 딸려 옵니다. |

Supabase CLI는 devDependency라 따로 설치하지 않습니다 (`npx supabase`).

> 확인된 조합: Node 24.18.0 / npm 11.16.0 / Windows 11 + PowerShell.
> macOS·Linux에서도 동작할 설계지만 이 저장소에서 실제로 돌려 본 것은 Windows입니다.

---

## 2. 처음 한 번

```bash
npm install
```

```bash
npm run db:start
```

로컬 Supabase 컨테이너를 띄웁니다. 첫 실행은 이미지를 받느라 몇 분 걸립니다.

```bash
npm run db:env
```

방금 뜬 로컬 인스턴스의 URL과 anon key를 읽어 **`.env`를 만들어 줍니다.**
`.env`는 커밋되지 않습니다(생성물). 값을 손으로 적을 필요가 없습니다.

```bash
npm run db:reset
```

`supabase/migrations/`를 처음부터 다시 적용합니다.

```bash
npm run db:smoke
```

앱이 실제로 쓰는 경로(GoTrue + PostgREST + anon key)로 RLS와 트리거를 확인합니다.
**162개 전부 통과해야 정상입니다.**

```bash
npm run test:unit
```

반복 전개·타임존·시간 보정·한국어 조사와 라벨 팔레트 대비를 확인합니다.
**55개 전부 통과.**

---

## 3. 매일 쓰는 명령

```bash
npm run db:start
```

```bash
npm run web
```

`http://localhost:8081`에서 웹으로 뜹니다. 안드로이드/iOS는 `npm run android` / `npm run ios`.

> Claude Code에서는 `.claude/launch.json`에 `web` 설정이 들어 있어 preview 도구가
> 이 서버를 그대로 띄웁니다. **셸에서 직접 dev 서버를 실행하지 말고 preview 도구를
> 쓰세요** (`AGENTS.md` 참고).

---

## 4. 명령 전체

| 명령 | 하는 일 |
|---|---|
| `npm run web` / `android` / `ios` | Expo 개발 서버 |
| `npm run lint` | ESLint (expo lint) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | 순수 함수 검사 (DB·화면 없이) |
| `npm run db:start` / `db:stop` | 로컬 Supabase 켜기/끄기 |
| `npm run db:reset` | 마이그레이션 재적용 (**로컬 데이터 전부 삭제**) |
| `npm run db:smoke` | RLS·트리거 스모크 테스트 |
| `npm run db:env` | 로컬 URL/anon key를 `.env`에 기록 |
| `npm run db:status` | 로컬 서비스 주소·키 확인 |
| `npm run db:types` | 대조용 타입 생성 (`database.generated.ts`) |
| `npm run icons` | 앱 아이콘 재생성 |

---

## 5. 로컬 Supabase 주소

`supabase/config.toml`에 고정돼 있습니다.

| | 주소 |
|---|---|
| API (PostgREST · GoTrue) | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (DB 브라우저) | `http://127.0.0.1:54323` |
| 메일함 (가입 확인 메일 확인용) | `http://127.0.0.1:54324` |

로컬 설정에서 켜 둔 것 두 가지 — 둘 다 이 프로젝트의 전제입니다.

- `auth.enable_anonymous_sign_ins = true` — **게스트 우선 사용**의 전제. 꺼져 있으면
  첫 실행이 계정 화면으로 튕깁니다.
- `auth.email.enable_confirmations = false` — 스모크 테스트가 가입 직후 세션을
  받아야 합니다. 켜져 있으면 테스트가 로그인 단계에서 멈춥니다.

---

## 6. 무엇을 고쳤을 때 무엇을 돌려야 하나

바꾼 것에 따라 확인 방법이 다릅니다. **커밋 전에 해당하는 것을 전부 통과시킵니다.**

| 바꾼 것 | 돌릴 것 |
|---|---|
| 아무거나 | `npm run lint` · `npm run typecheck` |
| `supabase/migrations/` · RLS · 정책 | `npm run db:reset && npm run db:smoke` |
| `src/lib/` 의 계산 로직 (반복·타임존·시간·조사) | `npm run test:unit` |
| 화면 | 웹 미리보기에서 실제로 눌러 보기 |

DB를 바꿨다면 `src/types/database.ts`도 함께 갱신합니다 (`npm run db:types` 또는 수기).

---

## 7. 미리 알아두면 좋은 것

**`.env`는 생성물입니다.** 커밋되지 않고, `npm run db:env`가 만듭니다. `EXPO_PUBLIC_*`
값은 **번들 타임에 주입**되므로 `.env`를 바꾸면 **개발 서버를 재시작**해야 반영됩니다.

**anon key는 공개되어도 되는 값입니다.** 보호는 전적으로 RLS가 합니다.
`service_role` key는 `.env`에 넣지 않습니다 (Edge Function 환경변수 전용).

**`npm run db:reset`은 로컬 데이터를 전부 지웁니다.** 화면에서 만들어 둔 캘린더·일정도
사라집니다. 스모크 테스트를 돌린 뒤에는 다시 만들어야 합니다.

**웹에는 날짜 선택기가 없습니다.** `@react-native-community/datetimepicker`가
Android·iOS만 지원해서 `date-time-field.web.tsx`로 갈라 뒀습니다. 새 네이티브 전용
모듈을 쓸 때는 웹 미리보기가 깨지지 않는지 확인하세요 (`docs/design-notes.md` 14번).

**Windows에서는 PowerShell과 Git Bash가 둘 다 있습니다.** 문법이 다릅니다
(PowerShell에는 `&&`가 없습니다). 위 명령들은 어느 쪽에서도 동작합니다.

---

## 8. 코드가 어디에 있나

```
src/
  app/                    Expo Router 라우트 (파일 = 화면)
  components/ui/          공용 UI. 화면에서 hex를 직접 쓰지 않는다.
  constants/theme.ts      디자인 토큰 — 색·간격·타이포의 유일한 출처
  features/
    auth/                 세션, 게스트→계정 전환, OAuth
    calendar/             월간 뷰
    calendars/            캘린더·구성원·초대
    events/               일정 쿼리, 폼, 참여자, 댓글
  lib/
    date.ts               달력 격자용 날짜 (화면 좌표)
    event-time.ts         일정의 시간 의미 (설계안 3장)
    recurrence.ts         RRULE 생성·전개
    timezone.ts           IANA 벽시계 ↔ 순간 변환
  stores/                 Zustand (캘린더 표시 필터)
  types/database.ts       DB 스키마 타입 — 마이그레이션과 1:1

supabase/migrations/      번호순. 기존 파일은 수정하지 않고 새로 추가한다.
scripts/                  스모크·단위 테스트, .env 생성

docs/design-notes.md      설계안에서 바꾼 것과 그 이유 ← 먼저 읽어 볼 것
docs/design-decisions.md  UI 시안의 결정 사항 ← 색을 만지기 전에 읽을 것
docs/design/ui-proposal.html  시안 원본. 브라우저로 열면 된다 (단일 파일)
```

---

## 9. 지금까지 된 것과 다음

설계안 11장의 1~8단계를 **모두 구현했습니다** — 스키마·인증 → 캘린더·초대 →
일정 → 반복 → 참여자·댓글 → 알림 → 활동 로그 → 계정 삭제.

알림 발송 Edge Function과 유니버설 링크용 앱 구성은 구현돼 있습니다. 로컬에서는
`EXPO_PUBLIC_PUSH_ENABLED=false`라 미연결 안내를 표시합니다. 실제 Expo/Supabase
프로젝트, 앱 식별자, HTTPS 도메인과 서명 인증서를 연결하는 순서는
`docs/deployment.md`를 따르세요.

### UI 시안과 색 토큰

별도로 UI 디자인 시안 작업이 끝나 있습니다. 기본 테마가 **살구**(`#E2673F` 계열)로
확정됐고, `theme.ts`와 12색 캘린더 라벨 팔레트까지 코드에 반영했습니다.
색을 바꾸기 전에 `docs/design-decisions.md`를 읽으세요 — 5장에 토큰 대응표와 팔레트 순서
규칙이 있습니다.

시안은 `docs/design/ui-proposal.html`을 브라우저로 열면 봅니다. 세 방향과 앱 다크모드를
실시간으로 전환할 수 있고, 필수·중요 범위 16화면이 들어 있습니다.

작업 규칙과 이 프로젝트의 원칙은 **`AGENTS.md`**, 설계안에서 바꾼 부분과 이유는
**`docs/design-notes.md`**, UI 결정 사항은 **`docs/design-decisions.md`**에 있습니다.
코드를 고치기 전에 먼저 읽으세요.
