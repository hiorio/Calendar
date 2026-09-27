import { Platform } from 'react-native';

import { deviceWidgetsSupported } from '@/features/widgets/widget-capability';

/** App Intents와 단축어의 파일 출력은 iOS 16 이상에서 제공한다. */
export const lockScreenBoardSupported =
  deviceWidgetsSupported &&
  Platform.OS === 'ios' &&
  Number.parseInt(String(Platform.Version), 10) >= 16;
