import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /** 그림자 없이 테두리만 */
  flat?: boolean;
  padded?: boolean;
};

export function Card({ style, flat = false, padded = true, ...rest }: CardProps) {
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
export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: { padding: Spacing.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg },
});
