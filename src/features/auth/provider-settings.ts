import { env } from '@/lib/env';

import {
  parseSocialProviderAvailability,
  type SocialProviderAvailability,
} from '@/features/auth/provider-settings-parser';

export type { SocialProviderAvailability } from '@/features/auth/provider-settings-parser';

export async function getSocialProviderAvailability(): Promise<SocialProviderAvailability> {
  const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: env.supabaseAnonKey },
  });
  if (!response.ok) throw new Error('로그인 제공자 설정을 확인하지 못했습니다');
  return parseSocialProviderAvailability(await response.json());
}
