import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Layout, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** 왼쪽 아이콘 (Ionicons 이름) */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** 기본은 중립색이며 꼭 강조해야 하는 행만 accent를 쓴다. */
  iconTone?: 'neutral' | 'accent';
  /** 오른쪽에 붙는 값 또는 커스텀 노드 */
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** 설정 화면류의 한 줄. onPress가 있으면 화살표가 붙는다. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  value,
  right,
  onPress,
  danger = false,
  disabled = false,
}: ListRowProps) {
  const { colors } = useTheme();
  const tone = danger ? 'danger' : 'default';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed && onPress ? colors.surfacePressed : 'transparent' },
        disabled && styles.disabled,
      ]}>
      {icon ? (
        <View style={styles.icon}>
          <Ionicons
            name={icon}
            size={20}
            color={
              danger
                ? colors.danger
                : iconTone === 'accent'
                  ? colors.accent
                  : colors.textSecondary
            }
          />
        </View>
      ) : null}

      <View style={styles.text}>
        <Txt variant="body" tone={tone}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
      </View>

      {right ??
        (value ? (
          <Txt variant="body" tone="secondary" numberOfLines={1}>
            {value}
          </Txt>
        ) : null)}

      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: Layout.prominentControlHeight,
  },
  icon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  disabled: { opacity: 0.45 },
});
