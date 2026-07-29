import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function EventEditorHeader({
  onSave,
  pending = false,
  saveDisabled = false,
}: {
  onSave: () => void;
  pending?: boolean;
  saveDisabled?: boolean;
}) {
  const { colors } = useTheme();
  const disabled = pending || saveDisabled;

  return (
    <Stack.Screen
      options={{
        title: '',
        headerBackVisible: false,
        headerShadowVisible: true,
        headerStyle: { backgroundColor: colors.background },
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && { backgroundColor: colors.surfacePressed },
            ]}>
            <Ionicons name="close" size={27} color={colors.text} />
          </Pressable>
        ),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="일정 저장"
            accessibilityState={{ disabled, busy: pending }}
            disabled={disabled}
            onPress={onSave}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                borderColor: colors.border,
                opacity: disabled ? 0.45 : 1,
              },
            ]}>
            {pending ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Txt variant="bodyStrong">저장</Txt>
            )}
          </Pressable>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  saveButton: {
    minWidth: 72,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
  },
});
