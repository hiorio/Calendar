import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatTime } from '@/lib/event-time';

export type DateTimeFieldProps = {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  onChange: (next: Date) => void;
};

/**
 * 시스템 날짜/시각 선택기.
 *
 * iOS의 compact 위젯은 그 자체가 버튼이라 그대로 두고, Android는 눌러서 다이얼로그를
 * 여는 방식이다. 플랫폼 관례를 흉내 내지 않고 각자의 UI를 그대로 쓴다.
 * 웹은 이 라이브러리가 지원하지 않아 `date-time-field.web.tsx`로 갈라져 있다.
 */
export function DateTimeField({ label, value, mode, onChange }: DateTimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <Txt variant="body" tone="secondary">
          {label}
        </Txt>
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          onChange={(_, next) => next && onChange(next)}
        />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Txt variant="body" tone="secondary">
        {label}
      </Txt>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 선택`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
          },
        ]}>
        <Txt variant="body">{mode === 'date' ? formatDate(value) : formatTime(value)}</Txt>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={value}
          mode={mode}
          onChange={(event, next) => {
            setOpen(false);
            if (event.type === 'set' && next) onChange(next);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 44,
  },
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
});
