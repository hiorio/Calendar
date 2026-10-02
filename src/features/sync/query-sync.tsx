import { focusManager, onlineManager, useQueryClient } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import type { NetworkState } from 'expo-network';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { clearHomeSnapshotCache } from '@/features/calendar/home-snapshot';
import { useTheme } from '@/hooks/use-theme';

const SHARED_QUERY_ROOTS = new Set([
  'calendars', 'events', 'comments', 'participants', 'reminders', 'attachments',
  'memos', 'activity', 'calendar-stickers', 'device-tokens', 'push-device',
]);

export function isSharedQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && SHARED_QUERY_ROOTS.has(queryKey[0]);
}

/** 알 수 없는 네트워크 상태로 재시도 전체를 정지시키지 않는다. */
export function isNetworkOnline(state: NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** 구형 OTA 바이너리에는 ExpoNetwork가 없을 수 있으므로 확인한 뒤 로드한다. */
const network = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoNetwork')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-network') as typeof import('expo-network')
  : null;

/** 활성 화면은 최대 30초 뒤 다시 확인하며, 배경/오프라인에서는 요청하지 않는다. */
export function QuerySyncStatus() {
  const { user } = useAuth();
  return user ? <SessionSyncStatus key={user.id} userId={user.id} /> : null;
}

function SessionSyncStatus({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [online, setOnline] = useState(onlineManager.isOnline());
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => onlineManager.subscribe(setOnline), []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    focusManager.setFocused(AppState.currentState === 'active');
    const updateNetwork = (state: NetworkState) => {
      if (active) onlineManager.setOnline(isNetworkOnline(state));
    };
    const refreshNetwork = () => {
      if (network) void network.getNetworkStateAsync().then(updateNetwork).catch(() => undefined);
    };
    refreshNetwork();
    const connection = network?.addNetworkStateListener(updateNetwork);
    const foreground = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') refreshNetwork();
    });
    return () => {
      active = false;
      connection?.remove();
      foreground.remove();
    };
  }, []);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    let calendarIds: Set<string> | null = null;
    const update = () => {
      const current = queryClient.getQueryData<{ id: string }[]>(['calendars', 'mine']);
      if (current) {
        const nextIds = new Set(current.map((calendar) => calendar.id));
        const lostAccess = calendarIds && [...calendarIds].some((id) => !nextIds.has(id));
        calendarIds = nextIds;
        if (lostAccess) {
          // 상세 쿼리의 RLS 오류가 기존 data를 남기지 않도록 접근 범위가 줄 때 제거한다.
          const predicate = (query: { queryKey: readonly unknown[] }) => isSharedQuery(query.queryKey) && query.queryKey[0] !== 'calendars';
          void queryClient.cancelQueries({ predicate }).then(async () => {
            queryClient.removeQueries({ type: 'inactive', predicate });
            await queryClient.resetQueries({ type: 'active', predicate });
          });
          void clearHomeSnapshotCache().catch(() => undefined);
        }
      }
      const shared = cache.findAll({ type: 'active', predicate: (query) => isSharedQuery(query.queryKey) });
      setHasError(shared.some((query) => query.state.status === 'error'));
      const latest = Math.max(0, ...shared.map((query) => query.state.dataUpdatedAt));
      setLastSyncedAt((previous) => Math.max(previous, latest));
    };
    const unsubscribe = cache.subscribe(update);
    const interval = setInterval(() => {
      if (!focusManager.isFocused() || !onlineManager.isOnline()) return;
      void queryClient.invalidateQueries({
        type: 'active',
        predicate: (query) => isSharedQuery(query.queryKey) && query.state.fetchStatus === 'idle',
      });
    }, 30_000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [queryClient, userId]);

  if (online && !hasError) return null;

  async function retry() {
    setRetrying(true);
    try {
      if (network) onlineManager.setOnline(isNetworkOnline(await network.getNetworkStateAsync()));
      if (onlineManager.isOnline()) {
        await queryClient.refetchQueries({ type: 'active', predicate: (query) => isSharedQuery(query.queryKey) });
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <View style={{ backgroundColor: colors.surfaceMuted, padding: Spacing.sm, gap: Spacing.xs }} accessibilityLiveRegion="polite">
      <Txt variant="caption" tone={online ? 'danger' : 'secondary'}>
        {online ? '일부 내용을 새로 불러오지 못했습니다.' : '인터넷 연결이 끊겼습니다. 저장된 내용을 표시합니다.'}
        {lastSyncedAt ? ` 최근 수신 ${new Date(lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </Txt>
      <Button label="다시 동기화" variant="secondary" size="md" loading={retrying} onPress={() => void retry().catch(() => setHasError(true))} />
    </View>
  );
}
