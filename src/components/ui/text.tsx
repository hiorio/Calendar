import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { Typography, type TypographyVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'default' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';

export type TxtProps = TextProps & {
  variant?: TypographyVariant;
  tone?: Tone;
};

const toneToColor = {
  default: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  danger: 'danger',
  onAccent: 'onAccent',
} as const;

export function Txt({ variant = 'body', tone = 'default', style, ...rest }: TxtProps) {
  const { colors } = useTheme();

  return <RNText style={[styles[variant], { color: colors[toneToColor[tone]] }, style]} {...rest} />;
}

const styles = StyleSheet.create(Typography);
