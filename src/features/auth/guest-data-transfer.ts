import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

const PENDING_TRANSFER_KEY = 'auth.pendingGuestDataTransfer.v1';

type PendingGuestDataTransfer = {
  token: string;
  guestUserId: string;
  preparedAt: string;
  /** 로그인 성공 직후 고정하며 이후 다른 계정으로 절대로 재지정하지 않는다. */
  targetUserId: string | null;
};

export class GuestDataTransferError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GuestDataTransferError';
  }
}

/** 게스트 세션이 살아 있을 때만 만들 수 있는 15분짜리 이관 권한을 보관한다. */
export async function prepareGuestDataTransfer(guestUserId: string) {
  const { data: token, error } = await supabase.rpc('prepare_guest_data_transfer');
  if (error) throw error;
  if (!token) throw new Error('캘린더 가져오기 요청을 만들지 못했습니다');

  const pending: PendingGuestDataTransfer = {
    token,
    guestUserId,
    preparedAt: new Date().toISOString(),
    targetUserId: null,
  };
  await AsyncStorage.setItem(PENDING_TRANSFER_KEY, JSON.stringify(pending));
}

/** 재시작 시 현재 계정을 추측해서 바인딩하지 않는다. 성공한 로그인 흐름에서만 호출한다. */
export async function bindPendingGuestDataTransfer(guestUserId: string, targetUserId: string) {
  const pending = await readPendingTransfer();
  if (!pending || pending.guestUserId !== guestUserId) {
    throw new GuestDataTransferError('가져올 캘린더 요청을 찾을 수 없습니다.');
  }
  if (pending.targetUserId && pending.targetUserId !== targetUserId) {
    throw new GuestDataTransferError('다른 계정으로 준비한 캘린더 가져오기 요청입니다.');
  }
  await AsyncStorage.setItem(
    PENDING_TRANSFER_KEY,
    JSON.stringify({ ...pending, targetUserId }),
  );
}

/**
 * 로그인된 정식 계정으로 보관 중인 이관 권한을 청구한다.
 *
 * 성공 응답이 유실될 수 있으므로 실패 시에는 토큰을 남긴다. 서버 함수가 같은 계정의
 * 재청구를 멱등 처리해서 앱을 다시 열었을 때 안전하게 마무리할 수 있다.
 */
export async function claimPendingGuestDataTransfer(expectedUserId: string): Promise<Json | null> {
  const pending = await readPendingTransfer();
  // 구버전·로그인 중 강제 종료 등으로 대상이 없는 기록은 자동 청구하지 않는다.
  if (!pending || pending.targetUserId !== expectedUserId) return null;
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  if (auth.session?.user.id !== expectedUserId || auth.session.user.is_anonymous) return null;

  const { data, error } = await supabase.rpc('claim_guest_data_transfer', {
    p_token: pending.token,
  });

  if (error) {
    // 만료·손상 토큰은 다시 시도해도 성공할 수 없다. 인증/네트워크 오류는 다음 앱
    // 시작 때 재시도할 수 있도록 보존한다.
    if (/찾을 수 없습니다|만료되었습니다|invalid input syntax for type uuid/i.test(error.message)) {
      await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
    }
    throw new GuestDataTransferError(
      '로그인은 완료됐지만 캘린더를 가져오지 못했습니다. 앱을 다시 열면 자동으로 다시 시도합니다.',
      { cause: error },
    );
  }

  await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
  return data;
}

/** 로그인에 실패해 아직 같은 게스트라면 준비해 둔 토큰을 기기에서 폐기한다. */
export async function discardPendingGuestDataTransfer(guestUserId: string) {
  const pending = await readPendingTransfer();
  if (pending?.guestUserId === guestUserId) {
    await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
  }
}

async function readPendingTransfer(): Promise<PendingGuestDataTransfer | null> {
  const raw = await AsyncStorage.getItem(PENDING_TRANSFER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingGuestDataTransfer>;
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.guestUserId !== 'string' ||
      typeof parsed.preparedAt !== 'string'
    ) {
      throw new Error('invalid pending transfer');
    }
    if (parsed.targetUserId !== undefined && parsed.targetUserId !== null && typeof parsed.targetUserId !== 'string') {
      throw new Error('invalid transfer target');
    }
    return { ...parsed, targetUserId: parsed.targetUserId ?? null } as PendingGuestDataTransfer;
  } catch {
    await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
    return null;
  }
}
