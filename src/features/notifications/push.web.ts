import { supabase } from '@/lib/supabase';

import type { PushStatus } from './push';

/**
 * 웹에서는 푸시를 등록하지 않는다.
 *
 * expo-notifications는 Android·iOS만 지원한다. 웹 푸시는 Expo의 푸시 서비스가 아니라
 * 브라우저의 Push API를 따로 붙여야 하는 별개의 일이라, 지금은 하지 않는다.
 * 이 파일이 없으면 웹 번들이 네이티브 모듈을 끌어와서 통째로 깨진다.
 */

export function configureNotificationHandler() {
  // 웹에서는 할 일이 없다
}

export async function registerForPush(): Promise<PushStatus> {
  return {
    state: 'unsupported',
    reason: '웹에서는 푸시 알림을 받을 수 없습니다. 앱에서 켜 주세요.',
  };
}

/** 웹에서 등록한 기기는 없지만, 다른 기기에서 등록한 것은 세어 준다. */
export async function countRegisteredDevices(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('device_tokens')
    .select('expo_token', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('disabled_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function unregisterPush(_userId: string) {
  // 등록한 적이 없으므로 해제할 것도 없다
}

export async function withPushDetachedForAccountSwitch<T>(
  _currentUserId: string | null | undefined,
  action: () => Promise<T>,
) {
  return action();
}

export type { PushStatus };
