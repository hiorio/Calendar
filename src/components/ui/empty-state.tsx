import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type EmptyStateProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
};

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={compact ? 20 : 26} color={colors.textTertiary} />
      </View>
      <View style={styles.text}>
        <Txt variant={compact ? 'body' : 'subtitle'}>{title}</Txt>
        {description ? (
          <Txt variant="caption" tone="secondary" style={styles.center}>
            {description}
          </Txt>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xxl,
  },
  compact: { padding: Spacing.lg, gap: Spacing.sm },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { alignItems: 'center', gap: Spacing.xs },
  center: { textAlign: 'center' },
});
