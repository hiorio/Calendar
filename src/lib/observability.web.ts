import type { ComponentType } from 'react';

/**
 * Sentry의 네이티브 SDK와 소스맵 설정은 iOS 빌드에서 사용한다.
 * 로컬 웹 미리보기는 오류 수집 대상이 아니므로 같은 호출 형태의 no-op을 제공한다.
 */
export const Sentry = {
  wrap<T extends ComponentType<object>>(component: T) {
    return component;
  },
};
