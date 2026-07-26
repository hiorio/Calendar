import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * 푸시 알림 등록 (네이티브 전용).
 *
 * 웹은 `push.web.ts`가 대신 쓰인다 — expo-notifications는 Android·iOS만 지원한다.
 *
 * **실제 발송을 확인하려면 개발 빌드가 필요하다.** SDK 53부터 Expo Go(Android)에서는
 * 원격 푸시가 동작하지 않고, `getExpoPushTokenAsync`는 EAS projectId를 요구한다.
 * 아직 EAS 프로젝트를 만들지 않아서 이 코드는 "권한까지는 받고, 토큰 단계에서
 * 이유를 알려 주는" 상태다. 억지로 성공한 척하지 않는다.
 */

export type PushStatus =
  | { state: 'unsupported'; reason: string }
  | { state: 'denied' }
  | { state: 'needs-build'; reason: string }
  | { state: 'registered'; token: string };

/** 앱이 떠 있을 때 알림이 온 경우의 표시 방식 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function registerForPush(userId: string): Promise<PushStatus> {
  // 시뮬레이터에는 푸시 토큰이 발급되지 않는다
  if (!Device.isDevice) {
    return { state: 'unsupported', reason: '시뮬레이터에서는 푸시 알림을 받을 수 없습니다.' };
  }

  // Android 13+는 채널이 하나라도 있어야 권한을 물을 수 있다
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;

  if (!granted) return { state: 'denied' };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return {
      state: 'needs-build',
      reason: 'EAS 프로젝트가 아직 없습니다. `eas init` 후 개발 빌드에서 동작합니다.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // 같은 기기에서 토큰이 갱신될 수 있다. 새로 쌓지 않고 갱신한다.
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        expo_token: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
        // 껐다 켠 기기는 다시 살린다
        disabled_at: null,
      },
      { onConflict: 'user_id,expo_token' },
    );

    if (error) throw error;
    return { state: 'registered', token };
  } catch (e) {
    return {
      state: 'needs-build',
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 로그아웃하거나 알림을 끌 때. 남겨 두면 남의 기기로 알림이 간다. */
export async function unregisterPush(userId: string, token: string) {
  await supabase.from('device_tokens').delete().eq('user_id', userId).eq('expo_token', token);
}
