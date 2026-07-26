import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { Typography } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * 홈 탭은 두지 않는다. 캘린더 앱의 첫 화면은 캘린더다.
 * (설계안 9장은 홈=통합뷰 / 캘린더=목록으로 나눴지만 두 화면이 사실상 같았다.
 *  캘린더 목록은 탭이 아니라 관리 화면으로 내렸다.)
 */
const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: '캘린더', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'new', title: '추가', icon: 'add-circle-outline', activeIcon: 'add-circle' },
  { name: 'activity', title: '활동', icon: 'pulse-outline', activeIcon: 'pulse' },
  { name: 'settings', title: '설정', icon: 'settings-outline', activeIcon: 'settings' },
];

export default function AppLayout() {
  const { session, isLoading } = useAuth();
  const { colors } = useTheme();

  // 스플래시가 아직 떠 있는 상태. 라우팅을 결정하지 않는다.
  if (isLoading) return null;
  // 정상 경로에서는 게스트 세션이 항상 있다. 여기 오는 건 익명 로그인이
  // 꺼져 있는 프로젝트뿐이라, 그때만 계정 화면으로 보낸다.
  if (!session) return <Redirect href="/account" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [
          styles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ],
      }}>
      {TABS.map(({ name, title, icon, activeIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? activeIcon : icon} color={color} size={size - 2} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ ios: 84, default: 62 }),
    paddingTop: 6,
  },
  label: { ...Typography.caption, fontWeight: '600' },
});
