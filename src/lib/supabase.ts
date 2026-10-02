import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import {
  authStorageForRuntime,
} from '@/lib/auth-storage';
import { env, isSupabaseConfigured } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * 웹 정적 렌더링(Node) 중에는 window/localStorage가 없다. 이때 저장소를 붙이면
 * 모듈 로드 시점에 ReferenceError로 죽으므로 세션 기능을 꺼둔다.
 */
const isServer = typeof window === 'undefined';
// 설정이 빠진 배포본은 실제 고정 키를 읽거나 지울 권한도 갖지 않는다. 잘못된 localhost
// 클라이언트의 refresh 실패가 정상 세션을 손상시키지 않게 격리 저장소를 쓴다.
const authRuntime = authStorageForRuntime(
  AsyncStorage,
  env.supabaseUrl,
  isSupabaseConfigured,
);

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    ...(isServer ? {} : { storage: authRuntime.storage }),
    storageKey: authRuntime.storageKey,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    // 모바일에서는 딥링크를 직접 처리한다 (features/auth/oauth.ts)
    detectSessionInUrl: Platform.OS === 'web' && !isServer,
    flowType: 'pkce',
    // 로그인·토큰 갱신이 겹쳐 같은 저장소를 동시에 덮어쓰지 않게 한다.
    lock: processLock,
  },
});

// 앱이 포그라운드일 때만 토큰을 자동 갱신한다. 백그라운드에서 돌리면
// 배터리를 쓰면서 실패한 갱신이 세션을 날릴 수 있다.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
