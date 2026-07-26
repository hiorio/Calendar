import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * 정적 렌더링(웹)을 지원하려면 이 값을 클라이언트에서 다시 계산해야 한다.
 * 하이드레이션 전에는 서버 렌더 결과와 맞추기 위해 'light'로 고정한다.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
