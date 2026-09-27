import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { usePreferredTextStyle } from '@/components/ui/preferred-text-style';
import { Typography } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * 홈 탭은 두지 않는다. 캘린더 앱의 첫 화면은 캘린더다.
 * (설계안 9장은 홈=통합뷰 / 캘린더=목록으로 나눴지만 두 화면이 사실상 같았다.
 *  캘린더 목록은 탭이 아니라 관리 화면으로 내렸다.)
 */
type Tab = {
  name: string;
  title: string;
  icon: IconName;
  activeIcon: IconName;
};

const TABS: Tab[] = [
  { name: 'index', title: '캘린더', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'activity', title: '활동', icon: 'pulse-outline', activeIcon: 'pulse' },
  { name: 'settings', title: '더보기', icon: 'grid-outline', activeIcon: 'grid' },
];

export default function AppLayout() {
  const { isLoading } = useAuth();
  const { colors } = useTheme();
  const preferredLabelStyle = usePreferredTextStyle(styles.label);

  // 인증 복구가 끝나기 전에는 기존처럼 앱 탭을 그리지 않는다.
  if (isLoading) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: [styles.label, preferredLabelStyle],
        tabBarStyle: [
          styles.bar,
          { backgroundColor: colors.chrome, borderTopColor: colors.chromeBorder },
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
      <Tabs.Screen name="new" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { ...Typography.caption, fontWeight: '600' },
});
