import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-provider';

/**
 * "추가" 탭의 자리를 지키는 라우트.
 *
 * 탭을 누르면 `(app)/_layout.tsx`가 이동을 막고 일정 추가 모달을 연다. 이 화면이
 * 실제로 그려지는 경우는 /new로 직접 들어왔을 때뿐이라, 그때도 같은 곳으로 보낸다.
 */
export default function NewTabRoute() {
  const { session } = useAuth();
  return session ? (
    <Redirect href="/event-new" />
  ) : (
    <Redirect
      href={{
        pathname: '/account',
        params: { reason: '연결을 복구한 뒤 일정을 추가할 수 있어요.' },
      }}
    />
  );
}
