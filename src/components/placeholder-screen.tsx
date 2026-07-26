import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Content, Header, Screen } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  emptyTitle: string;
  emptyDescription: string;
  /** 이 화면을 채우는 구현 단계 (설계안 11장) */
  step: string;
};

/**
 * 아직 구현하지 않은 탭. 빈 화면이라도 무엇이 올 자리인지는 분명히 보여준다.
 */
export function PlaceholderScreen({ title, icon, emptyTitle, emptyDescription, step }: Props) {
  const { colors } = useTheme();

  return (
    <Screen>
      <Content>
        <Header title={title} />
        <View style={styles.body}>
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
        </View>
        <View style={[styles.stepBadge, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="construct-outline" size={14} color={colors.textTertiary} />
          <Txt variant="caption" tone="tertiary">
            {step}
          </Txt>
        </View>
      </Content>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'center',
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
});
