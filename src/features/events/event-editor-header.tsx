import { Stack, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function EventEditorHeader({
  title = '일정',
  onSave,
  pending = false,
  saveDisabled = false,
}: {
  title?: string;
  onSave: () => void;
  pending?: boolean;
  saveDisabled?: boolean;
}) {
  const { colors } = useTheme();
  const disabled = pending || saveDisabled;

  return (
    <Stack.Screen
      options={{
        title,
        headerBackVisible: false,
        headerShadowVisible: true,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="일정 편집 취소"
            accessibilityState={{ disabled: pending }}
            disabled={pending}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerAction,
              { opacity: pending ? 0.45 : pressed ? 0.55 : 1 },
            ]}>
            <Txt variant="body" tone="accent">
              취소
            </Txt>
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
              styles.headerAction,
              { opacity: disabled ? 0.45 : pressed ? 0.55 : 1 },
            ]}>
            {pending ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Txt variant="bodyStrong" tone="accent">
                저장
              </Txt>
            )}
          </Pressable>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
