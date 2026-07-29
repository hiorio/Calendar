import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { usePreferredTextStyle } from './preferred-text-style';

export type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, style, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const preferredTextStyle = usePreferredTextStyle([styles.input, style]);

  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="secondary">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: focused ? colors.accent : colors.border,
          },
          style,
          preferredTextStyle,
        ]}
        {...rest}
      />
      {hint ? (
        <Txt variant="caption" tone="tertiary">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  input: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    height: 50,
  },
});
