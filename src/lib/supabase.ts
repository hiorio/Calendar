import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * 웹 정적 렌더링(Node) 중에는 window/localStorage가 없다. 이때 저장소를 붙이면
 * 모듈 로드 시점에 ReferenceError로 죽으므로 세션 기능을 꺼둔다.
 */
const isServer = typeof window === 'undefined';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    ...(isServer ? {} : { storage: AsyncStorage }),
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    // 모바일에서는 딥링크를 직접 처리한다 (features/auth/oauth.ts)
    detectSessionInUrl: Platform.OS === 'web' && !isServer,
    flowType: 'pkce',
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
