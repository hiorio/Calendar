import { File as ExpoFile } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';

import {
  LOCK_SCREEN_BACKGROUND_FILE,
  LOCK_SCREEN_OUTPUT_FILE,
  LOCK_SCREEN_SNAPSHOT_FILE,
  LOCK_SCREEN_SNAPSHOT_TEMP_FILE,
} from './constants';
import type { LockScreenBoardSnapshot } from './types';

const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;

function sharedFile(name: string) {
  if (!widgetsDirectory) return null;
  return new ExpoFile(widgetsDirectory, name);
}

export function publishLockScreenBoardSnapshot(snapshot: LockScreenBoardSnapshot) {
  const file = sharedFile(LOCK_SCREEN_SNAPSHOT_FILE);
  const temporary = sharedFile(LOCK_SCREEN_SNAPSHOT_TEMP_FILE);
  if (!file || !temporary) return false;
  if (temporary.exists) temporary.delete();
  temporary.create({ intermediates: true });
  let moved = false;
  try {
    temporary.write(JSON.stringify(snapshot));
    // expo-file-system의 overwrite move는 기존 파일을 지운 직후 완성된 임시 파일을
    // 옮긴다. App Intent도 이 짧은 교체 구간의 읽기 실패를 한 번 재시도한다.
    temporary.moveSync(file, { overwrite: true });
    moved = true;
  } finally {
    if (!moved && temporary.exists) temporary.delete();
  }
  return true;
}

export async function storeLockScreenBackground(sourceUri: string) {
  const destination = sharedFile(LOCK_SCREEN_BACKGROUND_FILE);
  if (!destination) throw new Error('이 앱 빌드에서는 잠금화면 보드를 사용할 수 없습니다.');
  const source = new ExpoFile(sourceUri);
  if (!source.exists) throw new Error('선택한 사진을 읽을 수 없습니다.');
  if ((source.size ?? 0) > MAX_BACKGROUND_BYTES) {
    throw new Error('배경사진은 25MB 이하로 골라 주세요.');
  }
  await source.copy(destination, { overwrite: true });
  return destination.uri;
}

export function removeLockScreenBackground() {
  const file = sharedFile(LOCK_SCREEN_BACKGROUND_FILE);
  if (file?.exists) file.delete();
}

/** 계정·표시 범위 전환 때 단축어가 전에 만든 일정 PNG도 공유 컨테이너에서 지운다. */
export function removeLockScreenBoardOutput() {
  const file = sharedFile(LOCK_SCREEN_OUTPUT_FILE);
  if (file?.exists) file.delete();
}

export function lockScreenBackgroundUri() {
  const file = sharedFile(LOCK_SCREEN_BACKGROUND_FILE);
  return file?.exists ? file.uri : null;
}
