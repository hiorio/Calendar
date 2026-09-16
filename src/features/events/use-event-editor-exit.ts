import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { confirm } from '@/lib/confirm';

/** 헤더·제스처·Android 뒤로 가기 모두 같은 저장/변경 이탈 규칙을 따른다. */
export function useEventEditorExit(pending: boolean, dirty: boolean) {
  const navigation = useNavigation();
  const mounted = useRef(true);
  const leaving = useRef(false);
  const asking = useRef(false);
  const savingRef = useRef(false);
  const current = useRef({ pending, dirty });
  useEffect(() => { current.current = { pending, dirty }; }, [pending, dirty]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  usePreventRemove(pending || dirty, ({ data }) => {
    if (leaving.current) { navigation.dispatch(data.action); return; }
    if (current.current.pending || savingRef.current || asking.current) return;
    asking.current = true;
    void confirm({ title: '변경 내용을 버릴까요?', message: '저장하지 않은 입력은 사라집니다.', confirmLabel: '버리기', destructive: true })
      .then((ok) => {
        if (ok && mounted.current && !current.current.pending && !savingRef.current) navigation.dispatch(data.action);
      }).finally(() => { asking.current = false; });
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || (!pending && !dirty)) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [pending, dirty]);

  const finish = useCallback(() => {
    // 외부 인증 전환 등으로 화면이 없어졌거나 다른 화면이 열린 뒤의 늦은 응답이다.
    if (!mounted.current || !navigation.isFocused() || leaving.current) return;
    leaving.current = true;
    router.back();
  }, [navigation]);

  return { finish, savingRef };
}
