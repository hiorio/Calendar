import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function AppLayout() {
  const { session, isLoading } = useAuth();
  const theme = useTheme();

  // 스플래시가 아직 떠 있는 상태. 라우팅을 결정하지 않는다.
  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendars"
        options={{
          title: '캘린더',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      {/* TODO(3단계): 탭 대신 일정 추가 모달을 띄운다 */}
      <Tabs.Screen
        name="new"
        options={{
          title: '추가',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size + 4} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: '활동',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
