import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useNotificationNavigation } from '@/features/notifications/navigation';
import { configureNotificationHandler } from '@/features/notifications/push';
import { useTheme } from '@/hooks/use-theme';
import { Sentry } from '@/lib/observability';

SplashScreen.preventAutoHideAsync();

// 앱이 떠 있는 동안 알림이 오면 어떻게 보일지. 등록보다 먼저 정해져 있어야 한다.
configureNotificationHandler();

/**
 * react-query 의 `refetchOnWindowFocus` 는 브라우저 이벤트를 본다. 네이티브에는
 * 그런 게 없어서 설정만 켜면 아무 일도 일어나지 않는다. AppState 를 연결해 줘야
 * 앱으로 돌아왔을 때 남이 고친 내용을 다시 받아 온다.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // 함께 쓰는 캘린더라 남이 고친 내용이 들어와야 한다. 내 기기의 mutation만
      // invalidate 하면 화면을 켜 둔 채로는 영영 갱신되지 않는다.
      // 앱으로 돌아왔을 때 다시 받아 오는 것이 가장 값싼 갱신 경로다.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

/** 세션 복원이 끝나기 전까지는 스플래시를 유지해 화면 깜빡임을 막는다 */
function SplashGate({ children }: PropsWithChildren) {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  return children;
}

function NotificationNavigation() {
  const { isLoading } = useAuth();
  useNotificationNavigation(!isLoading);
  return null;
}

function RootLayout() {
  const { colors, scheme, theme } = useTheme();
  const isDark = scheme === 'dark';
  const baseNavigationTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    dark: isDark || theme === 'ink',
    colors: {
      ...baseNavigationTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.chrome,
      text: colors.chromeText,
      border: colors.chromeBorder,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationNavigation />
          <SplashGate>
            <ThemeProvider value={navigationTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" options={{ title: '캘린더' }} />
                <Stack.Screen
                  name="account"
                  options={{ presentation: 'modal', headerShown: true, title: '계정' }}
                />
                <Stack.Screen
                  name="calendars"
                  options={{ presentation: 'modal', headerShown: true, title: '내 캘린더' }}
                />
                <Stack.Screen
                  name="calendar-new"
                  options={{ presentation: 'modal', headerShown: true, title: '캘린더 만들기' }}
                />
                <Stack.Screen
                  name="calendar/[id]"
                  options={{
                    headerShown: true,
                    title: '캘린더 설정',
                    headerBackTitle: '캘린더',
                  }}
                />
                <Stack.Screen
                  name="day"
                  options={{
                    presentation: 'modal',
                    headerShown: true,
                    title: '일정',
                    headerBackTitle: '캘린더',
                  }}
                />
                <Stack.Screen
                  name="join"
                  options={{ presentation: 'modal', headerShown: true, title: '초대' }}
                />
                <Stack.Screen
                  name="event-new"
                  options={{ presentation: 'modal', headerShown: true, title: '일정 추가' }}
                />
                <Stack.Screen
                  name="event/[id]"
                  options={{ presentation: 'modal', headerShown: true, title: '일정' }}
                />
                <Stack.Screen
                  name="notifications"
                  options={{ presentation: 'modal', headerShown: true, title: '알림 설정' }}
                />
                <Stack.Screen
                  name="preferences"
                  options={{ presentation: 'modal', headerShown: true, title: '설정' }}
                />
                <Stack.Screen
                  name="memos"
                  options={{ presentation: 'modal', headerShown: true, title: '메모' }}
                />
                <Stack.Screen
                  name="search"
                  options={{ presentation: 'modal', headerShown: true, title: '검색' }}
                />
                <Stack.Screen
                  name="external-calendars"
                  options={{ presentation: 'modal', headerShown: true, title: '외부 캘린더' }}
                />
                <Stack.Screen
                  name="account-delete"
                  options={{ presentation: 'modal', headerShown: true, title: '계정 삭제' }}
                />
              </Stack>
              <StatusBar style={isDark || theme === 'ink' ? 'light' : 'dark'} />
            </ThemeProvider>
          </SplashGate>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
