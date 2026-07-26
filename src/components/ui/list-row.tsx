import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** 왼쪽 아이콘 (Ionicons 이름) */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
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
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed && onPress ? colors.surfacePressed : 'transparent' },
        disabled && styles.disabled,
      ]}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: danger ? colors.dangerSoft : colors.accentSoft }]}>
          <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.accent} />
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
          <Txt variant="body" tone="secondary">
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
    minHeight: 54,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  disabled: { opacity: 0.45 },
});
