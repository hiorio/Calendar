import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  /** 이 화면을 실제로 채우는 구현 단계 (설계안 11장) */
  step: string;
};

/**
 * 1단계 산출물은 "로그인되는 빈 앱"이다. 아직 구현하지 않은 탭은
 * 어느 단계에서 채워지는지만 밝혀 둔다.
 */
export function PlaceholderScreen({ title, step }: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.center}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.caption}>
          {step}
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  caption: { textAlign: 'center', paddingHorizontal: Spacing.four },
});
