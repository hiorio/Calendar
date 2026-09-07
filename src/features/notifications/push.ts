import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
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
/** DB와 로컬 저장소 사이에서 끝나지 않은 작업을 앱 재시작 뒤에도 재개한다. */
const OPERATION_KEY = 'push.operation';
/** operation journal 이전 구현과의 로컬 호환용 키. */
const LEGACY_RELINK_PENDING_KEY = 'push.relinkPending';

type PushOperation =
  | {
      kind: 'bind';
      userId: string;
      token: string;
      previousToken: string | null;
    }
  | {
      kind: 'rebind';
      fromUserId: string;
      token: string;
    }
  | {
      kind: 'unbind';
      userId: string;
      token: string;
    }
  | {
      kind: 'session-end';
      userId: string;
      token: string;
    }
  | {
      kind: 'account-delete';
      userId: string;
      token: string;
    };

// 인증 변경과 토큰 재시도가 겹쳐 이전 사용자 행을 되살리지 않도록 한 줄로 세운다.
let pushMutationTail: Promise<void> = Promise.resolve();

function withPushMutation<T>(action: () => Promise<T>): Promise<T> {
  const run = pushMutationTail.then(action, action);
  pushMutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 이관 복구 같은 인증 종속 작업도 로그인·로그아웃과 같은 잠금을 사용한다. */
export function withCurrentAuthSession<T>(expectedUserId: string, action: () => Promise<T>) {
  return withPushMutation(async () => {
    if ((await sessionUserId()) !== expectedUserId) {
      throw new Error('사용자가 바뀌었습니다. 다시 시도해 주세요.');
    }
    return action();
  });
}

async function claimDeviceToken(userId: string, token: string) {
  if ((await sessionUserId()) !== userId) {
    throw new Error('푸시 토큰을 등록할 사용자가 현재 세션과 다릅니다.');
  }

  // 토큰을 소유한 현재 설치가 원자적으로 청구한다. 세션이 예기치 않게 바뀌어
  // 이전 user_id를 RLS로 지울 수 없어도 같은 토큰이 두 계정에 남지 않는다.
  const { error } = await supabase.rpc('claim_device_token', {
    p_expo_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });

  if (error) throw error;
}

async function deleteDeviceToken(userId: string, token: string) {
  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_token', token);

  if (error) throw error;
}

async function sessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

function isPushOperation(value: unknown): value is PushOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Partial<PushOperation>;
  if (typeof operation.kind !== 'string' || typeof operation.token !== 'string') return false;

  if (operation.kind === 'bind') {
    return (
      typeof operation.userId === 'string' &&
      (operation.previousToken === null || typeof operation.previousToken === 'string')
    );
  }
  if (operation.kind === 'rebind') return typeof operation.fromUserId === 'string';
  if (
    operation.kind === 'unbind' ||
    operation.kind === 'session-end' ||
    operation.kind === 'account-delete'
  ) {
    return typeof operation.userId === 'string';
  }
  return false;
}

async function readPushOperation(): Promise<PushOperation | null> {
  const raw = await AsyncStorage.getItem(OPERATION_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPushOperation(parsed)) return parsed;
  } catch {
    // 손상된 journal은 아래에서 지운다. 토큰 값은 별도 키에 계속 남는다.
  }

  await AsyncStorage.removeItem(OPERATION_KEY);
  return null;
}

async function writePushOperation(operation: PushOperation) {
  await AsyncStorage.setItem(OPERATION_KEY, JSON.stringify(operation));
}

async function finishBoundToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.removeItem(LEGACY_RELINK_PENDING_KEY);
  // OPERATION_KEY가 commit marker다. 다른 로컬 값을 모두 쓴 뒤 마지막에 지운다.
  await AsyncStorage.removeItem(OPERATION_KEY);
}

async function clearStoredPushStateUnlocked() {
  await AsyncStorage.multiRemove([TOKEN_KEY, LEGACY_RELINK_PENDING_KEY]);
  // 중간에 앱이 종료되면 journal이 남아 DB/로컬 정리를 다시 실행한다.
  await AsyncStorage.removeItem(OPERATION_KEY);
}

/**
 * 저장된 작업을 현재 인증 세션으로 멱등 재개한다.
 *
 * false는 세션이 없거나 journal의 사용자와 현재 사용자가 달라 안전하게 재개할 수
 * 없다는 뜻이다. 호출자는 이 경우 인증 변경을 시작하지 않는다.
 */
async function recoverPushOperationUnlocked(expectedUserId?: string): Promise<boolean> {
  const currentUserId = await sessionUserId();
  if (!currentUserId || (expectedUserId && currentUserId !== expectedUserId)) return false;

  const operation = await readPushOperation();
  if (!operation) {
    // 작업 journal 전 구현이 남긴 pending은 현재 세션에 한 번 재연결한다.
    const legacyPending = await AsyncStorage.getItem(LEGACY_RELINK_PENDING_KEY);
    if (!legacyPending) return true;

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await claimDeviceToken(currentUserId, token);
    await AsyncStorage.removeItem(LEGACY_RELINK_PENDING_KEY);
    return true;
  }

  if (operation.kind === 'bind') {
    // 새 토큰을 먼저 살려 두고 이전 토큰을 지운다. 어느 단계에서 꺼져도 journal로
    // 반복할 수 있고, claim RPC가 세션 만료 뒤 남은 옛 사용자 행도 원자적으로 옮긴다.
    await claimDeviceToken(currentUserId, operation.token);
    if (operation.previousToken && operation.previousToken !== operation.token) {
      // 이전 토큰도 현재 세션으로 청구해야 옛 user_id 행을 RLS 밖에서 정리할 수 있다.
      await claimDeviceToken(currentUserId, operation.previousToken);
      await deleteDeviceToken(currentUserId, operation.previousToken);
    }
    await finishBoundToken(operation.token);
    return true;
  }

  if (operation.kind === 'rebind') {
    // detach가 끝난 뒤 인증이 바뀌었으면 새 사용자, 실패했으면 원 사용자에게 복구된다.
    await claimDeviceToken(currentUserId, operation.token);
    await finishBoundToken(operation.token);
    return true;
  }

  if (operation.kind === 'session-end') {
    if (operation.userId === currentUserId) {
      // 세션 종료 전에 앱이 꺼졌거나 로그아웃이 실패했다. 원래 상태로 복구한다.
      await claimDeviceToken(currentUserId, operation.token);
      await finishBoundToken(operation.token);
    } else {
      // 세션 종료는 끝났지만 로컬 commit 전에 꺼졌다. 전역 claim으로 혹시 남은
      // 옛 행까지 가져와 삭제한 뒤 이 설치의 알림 설정을 비운다.
      await claimDeviceToken(currentUserId, operation.token);
      await deleteDeviceToken(currentUserId, operation.token);
      await clearStoredPushStateUnlocked();
    }
    return true;
  }

  if (operation.kind === 'account-delete') {
    if (operation.userId === currentUserId) {
      // RPC가 시작되기 전에 종료됐다면 계정과 토큰이 모두 남아 있으므로 복구한다.
      // RPC가 이미 계정을 지웠다면 FK 때문에 claim이 실패하고, journal을 보존해
      // 새 게스트 세션이 생긴 뒤 아래 분기에서 정리한다.
      await claimDeviceToken(currentUserId, operation.token);
      await finishBoundToken(operation.token);
    } else {
      await claimDeviceToken(currentUserId, operation.token);
      await deleteDeviceToken(currentUserId, operation.token);
      await clearStoredPushStateUnlocked();
    }
    return true;
  }

  if (operation.userId !== currentUserId) {
    // 예상 밖 세션 교체 뒤에도 옛 사용자 행을 남기지 않고 현재 설치의 알림을 끈다.
    await claimDeviceToken(currentUserId, operation.token);
  }
  await deleteDeviceToken(currentUserId, operation.token);
  await clearStoredPushStateUnlocked();
  return true;
}

function allowsNotifications(status: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS !== 'ios') return status.granted;

  const iosStatus = status.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * 푸시 알림 등록 (네이티브 전용).
 *
 * 웹은 `push.web.ts`가 대신 쓰인다 — expo-notifications는 Android·iOS만 지원한다.
 *
 * **실제 발송을 확인하려면 개발 빌드가 필요하다.** SDK 53부터 Expo Go(Android)에서는
 * 원격 푸시가 동작하지 않고, `getExpoPushTokenAsync`는 Expo projectId와 해당 bundle
 * ID의 APNs/FCM 자격증명을 요구한다. 권한은 있어도 토큰 발급·DB 등록이 실패할 수
 * 있으므로 이유를 사용자에게 그대로 보여 준다.
 */

export type PushStatus =
  | { state: 'unsupported'; reason: string }
  | { state: 'denied' }
  | { state: 'needs-build'; reason: string }
  | { state: 'registered'; token: string };

export type DevicePushState =
  | { supported: false; reason: string }
  | { supported: true; permission: 'allowed' | 'denied' | 'undetermined'; registered: boolean; locallyEnabled: boolean };

/** 권한 요청·토큰 발급 없이 현재 설치의 OS 권한과 서버 등록만 확인한다. */
export async function getDevicePushState(userId: string): Promise<DevicePushState> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return { supported: false, reason: '이 환경에서는 원격 알림을 받을 수 없습니다. 설치한 앱에서 확인해 주세요.' };
  }
  return withCurrentAuthSession(userId, async () => {
    const permission = await Notifications.getPermissionsAsync();
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    let registered = false;
    if (token) {
      const { data, error } = await supabase.from('device_tokens')
        .select('disabled_at').eq('user_id', userId).eq('expo_token', token).maybeSingle();
      if (error) throw error;
      registered = Boolean(data && data.disabled_at === null);
    }
    return {
      supported: true,
      permission: allowsNotifications(permission) ? 'allowed' : permission.status === 'undetermined' ? 'undetermined' : 'denied',
      registered,
      locallyEnabled: Boolean(token),
    };
  });
}

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
  // Android 13+는 채널이 하나라도 있어야 권한을 물을 수 있다
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permission = allowsNotifications(existing)
    ? existing
    : await Notifications.requestPermissionsAsync();

  if (!allowsNotifications(permission)) return { state: 'denied' };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return {
      state: 'needs-build',
      reason: '이 앱 빌드에 Expo projectId가 없습니다. 앱 설정을 확인한 뒤 다시 빌드해 주세요.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await withPushMutation(async () => {
      // 권한 화면을 보는 사이 계정이 바뀌었으면 전달받은 예전 id로 쓰지 않는다.
      if ((await sessionUserId()) !== userId) {
        throw new Error('알림을 켜는 동안 사용자가 바뀌었습니다. 다시 시도해 주세요.');
      }
      if (!(await recoverPushOperationUnlocked(userId))) {
        throw new Error('이전 푸시 토큰 작업을 안전하게 복구하지 못했습니다. 다시 시도해 주세요.');
      }

      const previousToken = await AsyncStorage.getItem(TOKEN_KEY);
      // DB 쓰기 전에 journal을 남긴다. 앱이 바로 꺼져도 다음 시작에서 old 삭제와
      // new upsert를 이어서 실행할 수 있다.
      await writePushOperation({ kind: 'bind', userId, token, previousToken });
      if (!(await recoverPushOperationUnlocked(userId))) {
        throw new Error('푸시 토큰 등록 세션이 바뀌었습니다. 다시 시도해 주세요.');
      }
    });

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
  await withPushMutation(async () => {
    if (!(await recoverPushOperationUnlocked(userId))) {
      throw new Error('푸시 토큰 작업의 사용자와 현재 사용자가 다릅니다.');
    }

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) {
      await AsyncStorage.removeItem(LEGACY_RELINK_PENDING_KEY);
      await AsyncStorage.removeItem(OPERATION_KEY);
      return;
    }

    await writePushOperation({ kind: 'unbind', userId, token });
    if (!(await recoverPushOperationUnlocked(userId))) {
      throw new Error('푸시 토큰 해제 세션이 바뀌었습니다. 다시 시도해 주세요.');
    }
  });
}

/**
 * 앱 시작이나 사용자 변경 때 중간에 끝난 bind/rebind/unbind를 다시 시도한다.
 */
export async function retryPendingPushRelink(userId: string) {
  await withPushMutation(async () => {
    await recoverPushOperationUnlocked(userId);
  });
}

/**
 * 런타임에 APNs/FCM 토큰이 교체되면 Expo token도 즉시 다시 받아 서버에 반영한다.
 * 사용자가 이 설치에서 알림을 켠 적이 있을 때만 움직인다.
 */
export function subscribeToPushTokenChanges(): () => void {
  // Expo Go의 Android에서는 이 API 자체가 동기적으로 throw한다.
  if (Platform.OS === 'android' && isRunningInExpoGo()) return () => undefined;

  try {
    const subscription = Notifications.addPushTokenListener((devicePushToken) => {
      // listener 안에서 native token을 다시 요청하면 listener가 재귀 호출된다.
      // 전달받은 값을 Expo token 교환 요청에 그대로 넘긴다.
      void refreshStoredExpoPushToken(devicePushToken).catch(() => undefined);
    });

    // 앱이 꺼져 있거나 구독 전에 바뀐 토큰도 한 번 확인한다. 이 호출로 listener가
    // 한 번 더 와도 그 callback은 위의 devicePushToken 경로라 재귀하지 않는다.
    void refreshStoredExpoPushToken().catch(() => undefined);
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

async function refreshStoredExpoPushToken(devicePushToken?: Notifications.DevicePushToken) {
  await withPushMutation(async () => {
    const userId = await sessionUserId();
    if (!userId || !(await recoverPushOperationUnlocked(userId))) return;

    const previousToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!previousToken) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    await writePushOperation({ kind: 'bind', userId, token, previousToken });
    await recoverPushOperationUnlocked(userId);
  });
}

/**
 * 기존 계정으로 전환하기 전에 이전 사용자의 푸시 토큰을 잠시 떼어 낸다.
 *
 * 로그인에 성공하면 같은 앱 설치의 토큰을 새 세션 사용자에게 연결하고,
 * 취소/실패해 같은 사용자로 남으면 원래 행을 복구한다. 이 경계가 없으면 한 기기에
 * 이전 사용자와 새 사용자의 토큰 행이 함께 남아 이전 사용자 앞으로 온 알림이
 * 새 사용자 화면에 표시될 수 있다.
 */
export async function withPushDetachedForAccountSwitch<T>(
  currentUserId: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  return withPushMutation(async () => {
    if (!currentUserId) return action();
    if (!(await recoverPushOperationUnlocked(currentUserId))) {
      throw new Error('이전 푸시 토큰 작업을 복구하기 전에는 계정을 바꿀 수 없습니다.');
    }

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return action();

    // delete 전에 journal을 기록한다. 삭제 응답이 유실돼도 현재 세션에 멱등 복구한다.
    await writePushOperation({ kind: 'rebind', fromUserId: currentUserId, token });
    try {
      await deleteDeviceToken(currentUserId, token);
    } catch (detachError) {
      try {
        await recoverPushOperationUnlocked(currentUserId);
      } catch {
        // journal을 남겨 다음 세션 복원 때 다시 시도한다.
      }
      throw detachError;
    }

    try {
      const result = await action();
      try {
        await recoverPushOperationUnlocked();
      } catch {
        // 로그인 자체는 이미 끝났다. journal을 남겨 세션 effect가 다시 시도한다.
      }
      return result;
    } catch (error) {
      try {
        // 인증이 그대로면 이전 사용자에게, 이미 바뀌었으면 새 사용자에게 복구한다.
        await recoverPushOperationUnlocked();
      } catch {
        // 원래 로그인 오류를 보존하고 journal로 다음 시작 때 복구한다.
      }
      throw error;
    }
  });
}

/** 토큰 해제와 세션 종료 사이에 다른 재등록이 끼지 않게 한 작업으로 묶는다. */
export async function withPushUnregisteredForSessionEnd<T>(
  userId: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  return withPushMutation(async () => {
    if (!userId) return action();
    if (!(await recoverPushOperationUnlocked(userId))) {
      throw new Error('이전 푸시 토큰 작업을 복구하기 전에는 로그아웃할 수 없습니다.');
    }

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      // 세션 종료가 끝날 때까지 journal을 유지한다. 그 전에 앱이 꺼지거나 로그아웃이
      // 실패하면 복구 시 같은 사용자에게 다시 연결한다.
      await writePushOperation({ kind: 'session-end', userId, token });
      await deleteDeviceToken(userId, token);
    } else {
      await AsyncStorage.removeItem(LEGACY_RELINK_PENDING_KEY);
      await AsyncStorage.removeItem(OPERATION_KEY);
    }

    try {
      const result = await action();
      await clearStoredPushStateUnlocked();
      return result;
    } catch (error) {
      // 같은 사용자면 복구하고, 세션이 이미 바뀌었으면 옛 행까지 청구해 제거한다.
      // 복구 실패는 journal로 남기고 원래 인증 오류를 보존한다.
      if (token) {
        try {
          await recoverPushOperationUnlocked();
        } catch {
          // 원래 인증 오류를 보존한다.
        }
      }
      throw error;
    }
  });
}

/** 계정 삭제의 cascade가 끝난 뒤 이 설치에 남은 토큰 journal도 직렬화해 지운다. */
export async function withPushStateClearedAfterAccountDeletion<T>(
  expectedUserId: string,
  action: () => Promise<T>,
): Promise<T> {
  return withPushMutation(async () => {
    if ((await sessionUserId()) !== expectedUserId) {
      throw new Error('계정 삭제를 시작한 사용자와 현재 사용자가 다릅니다. 다시 시도해 주세요.');
    }

    if (!(await recoverPushOperationUnlocked(expectedUserId))) {
      throw new Error('이전 푸시 토큰 작업을 복구하기 전에는 계정을 삭제할 수 없습니다.');
    }

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      await writePushOperation({ kind: 'account-delete', userId: expectedUserId, token });
    }

    try {
      const result = await action();
      await clearStoredPushStateUnlocked();
      return result;
    } catch (error) {
      if (token) {
        try {
          await recoverPushOperationUnlocked();
        } catch {
          // 원래 계정 삭제 오류를 보존하고 journal로 다음 시작 때 복구한다.
        }
      }
      throw error;
    }
  });
}
