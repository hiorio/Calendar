/**
 * Supabase의 기본 저장 키는 접속 URL에서 만들어진다. 배포 설정이 잠시 빠지면
 * 같은 앱도 다른 키를 읽게 되어 기존 세션을 잃은 것처럼 보일 수 있으므로,
 * 앱 설치 단위로 고정된 키를 사용한다.
 */
export const AUTH_STORAGE_KEY = 'timeflower.auth.session.v1';
export const UNCONFIGURED_AUTH_STORAGE_KEY = `${AUTH_STORAGE_KEY}.unconfigured`;

export type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function legacySupabaseAuthStorageKey(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

/**
 * 기존 배포본의 기본 키를 새 고정 키로 무손실 이관한다. 이전 OTA로 되돌아가도
 * 로그인이 풀리지 않도록 갱신값을 기존 키에도 함께 쓴다.
 */
export function createMigratingAuthStorage(
  storage: AuthStorage,
  supabaseUrl: string,
): AuthStorage {
  const legacyRoot = legacySupabaseAuthStorageKey(supabaseUrl);

  function legacyKey(key: string): string | null {
    if (!legacyRoot || !key.startsWith(AUTH_STORAGE_KEY)) return null;
    return `${legacyRoot}${key.slice(AUTH_STORAGE_KEY.length)}`;
  }

  return {
    async getItem(key) {
      const current = await storage.getItem(key);
      if (current !== null) return current;

      const fallbackKey = legacyKey(key);
      if (!fallbackKey || fallbackKey === key) return null;
      const legacy = await storage.getItem(fallbackKey);
      if (legacy === null) return null;

      await storage.setItem(key, legacy);
      return legacy;
    },

    async setItem(key, value) {
      await storage.setItem(key, value);

      const fallbackKey = legacyKey(key);
      if (!fallbackKey || fallbackKey === key) return;
      // 고정 키 저장이 성공했으면 이전 버전 호환 복제 실패로 인증 자체를 실패시키지 않는다.
      try {
        await storage.setItem(fallbackKey, value);
      } catch {
        // 다음 정상 시작에서도 고정 키를 우선 읽으므로 세션은 보존된다.
      }
    },

    async removeItem(key) {
      await storage.removeItem(key);

      const fallbackKey = legacyKey(key);
      if (!fallbackKey || fallbackKey === key) return;
      // 명시적 로그아웃 때 이전 키가 세션을 되살리지 않게 함께 지운다.
      await storage.removeItem(fallbackKey);
    },
  };
}

/** 설정이 없는 클라이언트가 정상 세션 저장소에 닿지 않도록 완전히 격리한다. */
export function authStorageForRuntime(
  storage: AuthStorage,
  supabaseUrl: string,
  isConfigured: boolean,
): { storage: AuthStorage; storageKey: string } {
  if (isConfigured) {
    return {
      storage: createMigratingAuthStorage(storage, supabaseUrl),
      storageKey: AUTH_STORAGE_KEY,
    };
  }

  return {
    storageKey: UNCONFIGURED_AUTH_STORAGE_KEY,
    storage: {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
  };
}
