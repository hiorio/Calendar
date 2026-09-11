import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import type { MyCalendar } from '@/features/calendars/queries';
import { useTheme } from '@/hooks/use-theme';

export function QuickCalendarPicker({
  calendars,
  selectedId,
  onChange,
}: {
  calendars: MyCalendar[];
  selectedId: string;
  onChange: (calendarId: string) => void;
}) {
  const { colors, scheme } = useTheme();

  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="secondary">
        저장할 캘린더
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row} accessibilityRole="radiogroup">
          {calendars.map((calendar) => {
            const selected = calendar.id === selectedId;
            return (
              <Pressable
                key={calendar.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${calendar.name}${calendar.memberCount > 1 ? `, 구성원 ${calendar.memberCount}명과 공유` : ''}`}
                onPress={() => onChange(calendar.id)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accentSoft : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                  pressed && { backgroundColor: colors.surfacePressed },
                ]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                  ]}
                />
                <Txt variant="label" tone={selected ? 'accent' : 'secondary'}>
                  {calendar.name}
                </Txt>
                {calendar.memberCount > 1 ? (
                  <Txt variant="micro" tone="tertiary">
                    공유
                  </Txt>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
  },
  dot: { width: 9, height: 9, borderRadius: Radius.pill },
});
