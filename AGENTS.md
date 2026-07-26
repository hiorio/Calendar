# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 이 프로젝트

공유 캘린더 앱. Expo (React Native) + Supabase.

- 설계 기준 문서는 대화에서 받은 "공유 캘린더 앱 상세 설계안". 구현하며 바꾼 부분은
  `docs/design-notes.md`에 이유와 함께 기록한다.
- DB 스키마를 바꿀 때는 `supabase/migrations/`에 새 파일을 추가하고
  `src/types/database.ts`를 함께 갱신한다. 기존 마이그레이션은 수정하지 않는다.
- 시간 처리 원칙(설계안 3장)은 전역 규칙이다. 종일 일정은 타임존 변환 대상이 아니고,
  반복 전개는 `events.timezone` 기준으로 한다.
- 화면 문구는 한국어.

현재 진행 단계: 1단계(스키마 · RLS · Auth) 완료.
