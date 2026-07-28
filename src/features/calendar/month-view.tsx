import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme, onColor } from '@/features/calendars/colors';
import { useTheme } from '@/hooks/use-theme';
import {
  WEEKDAY_LABELS,
  buildMonthMatrix,
  formatLunarDay,
  isoWeekNumber,
  isSameDay,
  isSameMonth,
  toDateKey,
  weekdayLabels,
  type WeekStart,
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
  /** 'YYYY-MM-DD' → 그 날의 일정들 */
  marksByDate?: Record<string, DayMark[]>;
  /** 메인 화면의 남는 세로 공간에 맞춘 날짜 셀 최소 높이 */
  dayCellMinHeight?: number;
  weekStart?: WeekStart;
  showWeekNumbers?: boolean;
  showLunar?: boolean;
  colorSaturday?: boolean;
};

const MAX_CHIPS = 3;

export function MonthView({
  month,
  selected,
  onSelect,
  marksByDate = {},
  dayCellMinHeight = 58,
  weekStart = 'sunday',
  showWeekNumbers = false,
  showLunar = false,
  colorSaturday = true,
}: MonthViewProps) {
  const { colors, scheme } = useTheme();
  const weeks = buildMonthMatrix(month, weekStart);
  const labels = weekdayLabels(weekStart);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <View style={styles.weekdayRow}>
        {showWeekNumbers ? (
          <View style={styles.weekNumberCell}>
            <Txt variant="micro" tone="tertiary">
              주
            </Txt>
          </View>
        ) : null}
        {labels.map((label) => {
          const weekday = WEEKDAY_LABELS.indexOf(label as (typeof WEEKDAY_LABELS)[number]);
          return (
          <View key={label} style={styles.weekdayCell}>
            <Txt
              variant="caption"
              style={{
                color:
                  weekday === 0
                    ? colors.sunday
                    : weekday === 6 && colorSaturday
                      ? colors.saturday
                      : colors.textTertiary,
              }}>
              {label}
            </Txt>
          </View>
          );
        })}
      </View>

      <View style={[styles.grid, { borderTopColor: colors.border }]}>
        {weeks.map((week) => (
          <View key={toDateKey(week[0])} style={[styles.week, { borderBottomColor: colors.border }]}>
            {showWeekNumbers ? (
              <View style={styles.weekNumberCell}>
                <Txt variant="micro" tone="tertiary">
                  {isoWeekNumber(week[0])}
                </Txt>
              </View>
            ) : null}
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
                  : weekday === 6 && colorSaturday
                    ? colors.saturday
                    : colors.text;

              return (
                <Pressable
                  key={toDateKey(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.getMonth() + 1}월 ${date.getDate()}일`}
                  accessibilityHint={
                    isSelected
                      ? '한 번 더 누르면 이 날의 일정을 엽니다'
                      : '이 날짜에 포커스를 맞춥니다'
                  }
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelect(date)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    { minHeight: dayCellMinHeight },
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

                  {showLunar ? (
                    <Txt variant="micro" tone="tertiary" style={styles.lunar}>
                      {formatLunarDay(date)}
                    </Txt>
                  ) : null}

                  <View style={styles.chips}>
                    {marks.slice(0, MAX_CHIPS).map((mark) => (
                      <View
                        key={mark.id}
                        style={[
                          styles.chip,
                          { backgroundColor: calendarColorForScheme(mark.color, scheme) },
                        ]}>
                        {/* 글자색은 라벨 색에서 계산한다. 흰색으로 고정하면
                            밝은 라벨(금·연두 등) 위에서 읽히지 않는다. */}
                        <Txt
                          variant="caption"
                          numberOfLines={1}
                          style={[styles.chipText, { color: onColor(mark.color, scheme) }]}>
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

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: Spacing.xs },
  weekNumberCell: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.xs,
  },
  grid: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.sm },
  week: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell: {
    flex: 1,
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
  lunar: { alignSelf: 'center', fontSize: 9, lineHeight: 11 },
  outside: { opacity: 0.5 },
  chips: { gap: 2 },
  chip: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  chipText: { fontSize: 10, lineHeight: 14 },
  more: { paddingLeft: 4, fontSize: 10, lineHeight: 12 },
});
