import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from '@/lib/env';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // 모바일에서는 딥링크를 직접 처리한다 (features/auth/oauth.ts)
    detectSessionInUrl: Platform.OS === 'web',
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
