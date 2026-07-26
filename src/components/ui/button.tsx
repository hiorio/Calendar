import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 가로를 꽉 채운다 */
  block?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  loading = false,
  block = true,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const surface = {
    primary: { bg: colors.accent, pressed: colors.accentPressed, border: 'transparent' },
    secondary: { bg: colors.surface, pressed: colors.surfacePressed, border: colors.border },
    ghost: { bg: 'transparent', pressed: colors.surfaceMuted, border: 'transparent' },
    danger: { bg: colors.dangerSoft, pressed: colors.surfacePressed, border: 'transparent' },
  }[variant];

  const tone = (
    { primary: 'onAccent', secondary: 'default', ghost: 'accent', danger: 'danger' } as const
  )[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        block && styles.block,
        {
          backgroundColor: pressed ? surface.pressed : surface.bg,
          borderColor: surface.border,
          opacity: inactive ? 0.45 : 1,
        },
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accent} />
      ) : (
        <Txt variant="bodyStrong" tone={tone}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
  },
  md: { height: 42 },
  lg: { height: 52 },
  block: { alignSelf: 'stretch' },
});
