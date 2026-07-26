import { Alert, Platform } from 'react-native';

/**
 * 되돌리기 어려운 동작 앞에서 한 번 묻는다.
 *
 * react-native-web의 Alert는 동작하지 않아서 웹에서는 window.confirm을 쓴다.
 * 이 갈래가 없으면 웹에서 확인 없이 그냥 실행돼 버린다.
 */
export function confirm({
  title,
  message,
  confirmLabel = '확인',
  destructive = false,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** 결과 알림. 웹에서는 alert. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
