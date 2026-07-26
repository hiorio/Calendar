import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  WEEKDAY_LABELS,
  buildMonthMatrix,
  formatMonthTitle,
  isSameDay,
  isSameMonth,
  toDateKey,
} from '@/lib/date';

/** 격자 한 칸에 찍히는 일정 요약. 3단계에서 실제 일정으로 채운다. */
export type DayMark = {
  id: string;
  title: string;
  color: string;
};

export type MonthViewProps = {
  /** 보고 있는 달 (1일로 정규화된 Date) */
  month: Date;
  selected: Date;
  onSelect: (date: Date) => void;
  /** delta 만큼 달 이동 (-1 이전, +1 다음) */
  onShiftMonth: (delta: number) => void;
  /** 오늘로 되돌리기 */
  onToday: () => void;
  /** 'YYYY-MM-DD' → 그 날의 일정들 */
  marksByDate?: Record<string, DayMark[]>;
};

const MAX_CHIPS = 3;

export function MonthView({
  month,
  selected,
  onSelect,
  onShiftMonth,
  onToday,
  marksByDate = {},
}: MonthViewProps) {
  const { colors } = useTheme();
  const weeks = buildMonthMatrix(month);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <View style={styles.monthBar}>
        <Txt variant="title">{formatMonthTitle(month)}</Txt>

        <View style={styles.monthNav}>
          <NavButton icon="chevron-back" label="이전 달" onPress={() => onShiftMonth(-1)} />
          <Pressable
            accessibilityRole="button"
            onPress={onToday}
            style={({ pressed }) => [
              styles.todayButton,
              {
                backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
              },
            ]}>
            <Txt variant="label" tone="secondary">
              오늘
            </Txt>
          </Pressable>
          <NavButton icon="chevron-forward" label="다음 달" onPress={() => onShiftMonth(1)} />
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={label} style={styles.weekdayCell}>
            <Txt
              variant="caption"
              style={{
                color:
                  index === 0 ? colors.sunday : index === 6 ? colors.saturday : colors.textTertiary,
              }}>
              {label}
            </Txt>
          </View>
        ))}
      </View>

      <View style={[styles.grid, { borderTopColor: colors.border }]}>
        {weeks.map((week) => (
          <View key={toDateKey(week[0])} style={[styles.week, { borderBottomColor: colors.border }]}>
            {week.map((date) => {
              const outside = !isSameMonth(date, month);
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selected);
              const marks = marksByDate[toDateKey(date)] ?? [];
              const weekday = date.getDay();

              const numberColor = outside
                ? colors.textTertiary
                : weekday === 0
                  ? colors.sunday
                  : weekday === 6
                    ? colors.saturday
                    : colors.text;

              return (
                <Pressable
                  key={toDateKey(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.getMonth() + 1}월 ${date.getDate()}일`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelect(date)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.accentSoft },
                    pressed && !isSelected && { backgroundColor: colors.surfaceMuted },
                  ]}>
                  <View
                    style={[
                      styles.dayNumber,
                      isToday && { backgroundColor: colors.accent },
                    ]}>
                    <Txt
                      variant="caption"
                      style={[
                        styles.dayNumberText,
                        { color: isToday ? colors.onAccent : numberColor },
                        outside && styles.outside,
                      ]}>
                      {date.getDate()}
                    </Txt>
                  </View>

                  <View style={styles.chips}>
                    {marks.slice(0, MAX_CHIPS).map((mark) => (
                      <View key={mark.id} style={[styles.chip, { backgroundColor: mark.color }]}>
                        <Txt variant="caption" numberOfLines={1} style={styles.chipText}>
                          {mark.title}
                        </Txt>
                      </View>
                    ))}
                    {marks.length > MAX_CHIPS ? (
                      <Txt variant="caption" tone="tertiary" style={styles.more}>
                        +{marks.length - MAX_CHIPS}
                      </Txt>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function NavButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
      ]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    height: 32,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: Spacing.xs },
  grid: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.sm },
  week: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell: {
    flex: 1,
    minHeight: 58,
    paddingTop: 5,
    paddingBottom: 4,
    paddingHorizontal: 2,
    gap: 3,
    borderRadius: Radius.sm,
  },
  dayNumber: {
    alignSelf: 'center',
    minWidth: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayNumberText: { fontWeight: '600' },
  outside: { opacity: 0.5 },
  chips: { gap: 2 },
  chip: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  chipText: { color: '#FFFFFF', fontSize: 10, lineHeight: 14 },
  more: { paddingLeft: 4, fontSize: 10, lineHeight: 12 },
});
