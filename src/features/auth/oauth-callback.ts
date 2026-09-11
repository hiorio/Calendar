export type OAuthCallback =
  | { ok: true; code: string }
  | { ok: false; message: string };

/**
 * OAuth 결과는 브라우저가 돌려준 URL을 그대로 믿지 않는다.
 * 시작할 때 만든 callback 주소와 scheme/host/path가 같은 경우에만 code를 받는다.
 */
export function parseOAuthCallback(resultUrl: string, expectedRedirectUrl: string): OAuthCallback {
  let returned: URL;
  let expected: URL;

  try {
    returned = new URL(resultUrl);
    expected = new URL(expectedRedirectUrl);
  } catch {
    return { ok: false, message: '로그인 응답 주소가 올바르지 않습니다' };
  }

  if (
    returned.protocol !== expected.protocol ||
    returned.host !== expected.host ||
    normalizePath(returned.pathname) !== normalizePath(expected.pathname)
  ) {
    return { ok: false, message: '로그인 응답 주소를 확인할 수 없습니다' };
  }

  const providerError =
    returned.searchParams.get('error_description') ??
    returned.searchParams.get('error_message') ??
    returned.searchParams.get('error');

  if (providerError) {
    return { ok: false, message: providerError };
  }

  const code = returned.searchParams.get('code');
  if (!code) return { ok: false, message: '인증 코드를 받지 못했습니다' };

  return { ok: true, code };
}

function normalizePath(path: string) {
  if (!path || path === '/') return '/';
  return path.replace(/\/+$/, '');
}
