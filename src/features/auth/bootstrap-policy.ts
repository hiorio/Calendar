/**
 * 새 설치에만 게스트 계정을 만든다. 같은 설치의 사용자 흔적이 남아 있으면
 * 일시적인 인증 실패를 새 사용자로 덮어쓰지 않고 로컬 데이터를 보존한다.
 */
export function shouldCreateGuestSession({
  isConfigured,
  rememberedUserId,
}: {
  isConfigured: boolean;
  rememberedUserId: string | null;
}): boolean {
  return isConfigured && rememberedUserId === null;
}
