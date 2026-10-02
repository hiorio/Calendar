import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'timeflower-auth-continuity-v1';

export type AuthContinuity = {
  userId: string;
  isAnonymous: boolean;
  savedAt: string;
};

export async function loadAuthContinuity(): Promise<AuthContinuity | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isAuthContinuity(value)) throw new Error('invalid auth continuity');
    return value;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveAuthContinuity(user: {
  id: string;
  is_anonymous?: boolean;
}): Promise<void> {
  return AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      userId: user.id,
      isAnonymous: user.is_anonymous === true,
      savedAt: new Date().toISOString(),
    } satisfies AuthContinuity),
  );
}

export function clearAuthContinuity(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEY);
}

function isAuthContinuity(value: unknown): value is AuthContinuity {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as AuthContinuity).userId === 'string' &&
    Boolean((value as AuthContinuity).userId) &&
    typeof (value as AuthContinuity).isAnonymous === 'boolean' &&
    typeof (value as AuthContinuity).savedAt === 'string'
  );
}
