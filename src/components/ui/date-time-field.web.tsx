import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toDateKey } from '@/lib/date';

import type { DateTimeFieldProps } from './date-time-field';

/**
 * 웹용 날짜/시각 입력.
 *
 * `@react-native-community/datetimepicker`는 Android·iOS만 지원한다. 웹에서는
 * 브라우저가 이미 좋은 선택기를 갖고 있으므로 네이티브 input을 그대로 쓴다.
 * (react-native-web은 DOM으로 렌더되므로 이 파일에서는 input을 직접 쓸 수 있다.)
 */
export function DateTimeField({ label, value, mode, onChange }: DateTimeFieldProps) {
  const { colors, scheme } = useTheme();

  return (
    <View style={styles.row}>
      <Txt variant="body" tone="secondary">
        {label}
      </Txt>

      <input
        aria-label={label}
        type={mode}
        value={mode === 'date' ? toDateKey(value) : toTimeValue(value)}
        onChange={(e) => {
          const next = mode === 'date' ? withDate(value, e.target.value) : withTime(value, e.target.value);
          // 사용자가 입력을 지우는 중이면 빈 문자열이 온다. 그때는 값을 건드리지 않는다.
          if (next) onChange(next);
        }}
        style={{
          ...Typography.body,
          color: colors.text,
          backgroundColor: colors.surfaceMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: Radius.sm,
          padding: `${Spacing.sm}px ${Spacing.md}px`,
          fontFamily: 'inherit',
          // 브라우저가 그리는 달력 팝업과 시계 아이콘도 같은 배색을 따르게 한다
          colorScheme: scheme,
        }}
      />
    </View>
  );
}

/** 'HH:MM' (input[type=time]이 요구하는 24시간 표기) */
function toTimeValue(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

function withDate(base: Date, value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  const next = new Date(base);
  // setDate를 먼저 1로 내려 두지 않으면 31일에 2월을 고를 때 달이 튄다
  next.setDate(1);
  next.setFullYear(year, month - 1, day);
  return next;
}

function withTime(base: Date, value: string): Date | null {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 44,
  },
});
