import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * OTA 번들은 위젯 모듈이 들어가기 전의 iOS 바이너리에도 도달할 수 있다.
 * 네이티브 모듈이 실제로 있을 때만 expo-widgets를 참조하는 모듈을 로드한다.
 */
export const deviceWidgetsSupported =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets') !== null;

const WidgetSyncComponent = deviceWidgetsSupported
  // 정적 import는 위젯 모듈이 없는 구형 OTA 바이너리에서도 즉시 평가되어 앱을 종료시킨다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('./widget-sync') as typeof import('./widget-sync')).WidgetSync
  : null;

export function WidgetSyncGate() {
  return WidgetSyncComponent ? <WidgetSyncComponent /> : null;
}
