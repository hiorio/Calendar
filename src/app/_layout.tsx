import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
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

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SplashGate>
            <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" />
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
                  options={{ headerShown: true, title: '캘린더 설정' }}
                />
                <Stack.Screen
                  name="join"
                  options={{ presentation: 'modal', headerShown: true, title: '초대' }}
                />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </SplashGate>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
