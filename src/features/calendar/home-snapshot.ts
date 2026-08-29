import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseHomeSnapshotCache,
  upsertHomeMonthSnapshot,
  type HomeMonthSnapshot,
} from '@/features/calendar/home-snapshot-cache';

const STORAGE_KEY = 'timeline-home-month-snapshot-v1';

let writeQueue: Promise<void> = Promise.resolve();

export async function loadHomeMonthSnapshot(
  userId: string,
  monthKey: string,
): Promise<HomeMonthSnapshot | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const cache = parseHomeSnapshotCache(raw);

  if (!cache) {
    if (raw !== null) await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }

  // 쿼리 키에는 사용자 id가 없으므로 저장값도 반드시 현재 세션과 대조한다.
  // 다르면 돌려주지 않고 즉시 폐기해 이전 사용자의 제목이 한 프레임도 보이지 않게 한다.
  if (cache.userId !== userId) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }

  return cache.months.find((month) => month.key === monthKey) ?? null;
}

export function saveHomeMonthSnapshot(
  userId: string,
  snapshot: HomeMonthSnapshot,
): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const cache = parseHomeSnapshotCache(raw);
      const next = upsertHomeMonthSnapshot(cache, userId, snapshot);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    });

  return writeQueue;
}

export function clearHomeSnapshotCache(): Promise<void> {
  // 진행 중인 저장 뒤에 삭제를 직렬화해 계정 전환 직전의 늦은 저장이
  // 이미 지운 이전 사용자 스냅샷을 되살리지 못하게 한다.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.removeItem(STORAGE_KEY));
  return writeQueue;
}
