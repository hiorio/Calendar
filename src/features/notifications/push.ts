import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * 이 기기에 발급된 토큰을 기억해 둔다.
 *
 * 로그아웃할 때 "이 기기의 토큰만" 지우려면 그 값을 알아야 하는데, 로그아웃
 * 시점에는 다시 발급받을 수 없다(권한·네트워크가 없을 수 있다). 등록할 때
 * 적어 두는 것이 유일하게 확실한 방법이다.
 */
const TOKEN_KEY = 'push.expoToken';

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
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return { state: 'registered', token };
  } catch (e) {
    return {
      state: 'needs-build',
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 서버에 등록된 내 기기 수. 화면이 다시 열려도 상태가 남아 있게 한다.
 *
 * 로컬 state 만 쓰면 화면을 닫았다 열 때마다 "등록 안 됨"으로 보인다.
 */
export async function countRegisteredDevices(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('device_tokens')
    .select('expo_token', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('disabled_at', null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * 로그아웃할 때 이 기기의 토큰을 떼어 낸다.
 *
 * 안 지우면 기기를 넘겨받은 다음 사용자의 화면에 **이전 사용자 앞으로 온 알림**이
 * 뜬다. 발송 워커가 다른 계정의 토큰으로 보내지 않도록 세션 종료 시 정리한다.
 *
 * 계정 삭제는 `device_tokens`가 cascade로 함께 지워지므로 따로 부르지 않아도 된다.
 */
export async function unregisterPush(userId: string) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;

  await supabase.from('device_tokens').delete().eq('user_id', userId).eq('expo_token', token);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * 기존 계정으로 전환하기 전에 이전 사용자의 푸시 토큰을 잠시 떼어 낸다.
 *
 * 로그인에 성공하면 로컬 토큰도 지우고, 취소/실패해 같은 사용자로 남으면 DB 행을
 * 복구한다. 이 경계가 없으면 한 기기에 이전 사용자와 새 사용자의 토큰 행이 함께 남아
 * 이전 사용자 앞으로 온 알림이 새 사용자 화면에 표시될 수 있다.
 */
export async function withPushDetachedForAccountSwitch<T>(
  currentUserId: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (!currentUserId) return action();

  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return action();

  const { error: detachError } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', currentUserId)
    .eq('expo_token', token);
  if (detachError) throw detachError;

  try {
    const result = await action();
    await AsyncStorage.removeItem(TOKEN_KEY);
    return result;
  } catch (error) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id === currentUserId) {
      try {
        await supabase.from('device_tokens').upsert(
          {
            user_id: currentUserId,
            expo_token: token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            updated_at: new Date().toISOString(),
            disabled_at: null,
          },
          { onConflict: 'user_id,expo_token' },
        );
      } catch {
        // 원래 로그인 오류를 보존한다. 토큰은 다음 앱 알림 등록 때 다시 연결된다.
      }
    } else {
      // 인증은 전환됐는데 후처리만 실패한 경우 이전 토큰을 새 사용자에게 넘기지 않는다.
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
    throw error;
  }
}
