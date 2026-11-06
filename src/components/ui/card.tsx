import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /** 기본값 true. 실제로 떠 있는 표면만 false로 명시한다. */
  flat?: boolean;
  padded?: boolean;
};

export function Card({ style, flat = true, padded = true, ...rest }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        { backgroundColor: colors.surface, borderColor: colors.border },
        !flat && Elevation.card,
        !flat && Platform.OS === 'ios' && { shadowColor: colors.shadow },
        style,
      ]}
      {...rest}
    />
  );
}

/** 카드 안에서 항목을 나누는 선 */
export type DividerProps = ViewProps & {
  /** none은 끝까지, content는 일반 행 본문, icon은 아이콘이 있는 ListRow 본문에 맞춘다. */
  inset?: 'none' | 'content' | 'icon' | number;
};

export function Divider({ inset = 'content', style, ...rest }: DividerProps) {
  const { colors } = useTheme();
  const marginLeft =
    typeof inset === 'number'
      ? inset
      : { none: 0, content: Spacing.lg, icon: Spacing.lg + 24 + Spacing.md }[inset];

  return (
    <View
      style={[styles.divider, { backgroundColor: colors.border, marginLeft }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: { padding: Spacing.lg },
  divider: { height: StyleSheet.hairlineWidth },
});
