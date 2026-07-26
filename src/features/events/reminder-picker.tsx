import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import {
  REMINDER_CHOICES,
  useMyReminders,
  useToggleReminder,
} from '@/features/events/reminders';
import { useTheme } from '@/hooks/use-theme';

/** 이 일정에 대해 나에게만 울릴 알림. 여러 개 걸 수 있다. */
export function ReminderPicker({ eventId }: { eventId: string }) {
  const { colors } = useTheme();
  const reminders = useMyReminders(eventId);
  const toggle = useToggleReminder(eventId);

  const selected = new Set(reminders.data ?? []);

  return (
    <View style={styles.section}>
      <Txt variant="label" tone="secondary">
        미리 알림
      </Txt>

      <View style={styles.chips}>
        {REMINDER_CHOICES.map((choice) => {
          const on = selected.has(choice.minutes);
          return (
            <Pressable
              key={choice.minutes}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`미리 알림 ${choice.label}`}
              disabled={toggle.isPending}
              onPress={() => toggle.mutate({ minutes: choice.minutes, on: !on })}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                },
              ]}>
              <Ionicons
                name={on ? 'notifications' : 'notifications-outline'}
                size={14}
                color={on ? colors.accent : colors.textTertiary}
              />
              <Txt variant="label" tone={on ? 'accent' : 'secondary'}>
                {choice.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Txt variant="caption" tone="tertiary">
        나에게만 울립니다. 다른 구성원은 각자 설정합니다.
      </Txt>

      {toggle.isError ? (
        <Txt variant="caption" tone="danger">
          {(toggle.error as Error).message}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 34,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
