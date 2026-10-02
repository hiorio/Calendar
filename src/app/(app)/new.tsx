import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-provider';

/** 숨김 호환 라우트. 예전 딥링크로 들어와도 현재 일정 추가 흐름으로 보낸다. */
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
