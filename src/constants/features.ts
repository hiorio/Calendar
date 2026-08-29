/**
 * 기능의 진입점과 내부 호출을 같은 값으로 잠근다.
 *
 * Google·Apple 로그인은 공급자 설정이 실제로 활성화된 경우에만 계정 화면에서
 * 사용할 수 있다. AuthProvider도 이 값을 확인해 숨겨진 경로의 직접 호출을 막는다.
 */
export const SOCIAL_AUTH_ENABLED = true;
