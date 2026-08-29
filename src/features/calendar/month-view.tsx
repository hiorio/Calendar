import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { layoutWeekMarks } from '@/features/calendar/month-layout';
import { calendarColorForScheme, onColor } from '@/features/calendars/colors';
import { stickerByKey, type StickerKey } from '@/features/stickers/catalog';
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

/** 월간 격자에 그리는 일정 요약. 같은 id가 이어지면 기간 막대로 합친다. */
export type DayMark = {
  id: string;
  title: string;
  color: string;
  isAllDay: boolean;
};

export type DayStickerMark = {
  id: string;
  stickerKey: StickerKey;
};

export type MonthViewProps = {
  /** 보고 있는 달 (1일로 정규화된 Date) */
  month: Date;
  selected: Date;
  onSelect: (date: Date) => void;
  /** 'YYYY-MM-DD' → 그 날의 일정들 */
  marksByDate?: Record<string, DayMark[]>;
  /** 'YYYY-MM-DD' → 그 날에 표시할 캘린더 스티커들 */
  stickersByDate?: Record<string, DayStickerMark[]>;
  /** 메인 화면의 남는 세로 공간에 맞춘 날짜 셀 최소 높이 */
  dayCellMinHeight?: number;
  /** 부모가 준 남은 높이를 6주가 똑같이 나눠 사용한다. */
  fillAvailableSpace?: boolean;
  weekStart?: WeekStart;
  showWeekNumbers?: boolean;
  showLunar?: boolean;
  colorSaturday?: boolean;
};

const MAX_EVENT_LANES = 3;
const EVENT_ROW_HEIGHT = 16;
const EVENT_ROW_GAP = 2;
const EVENT_TOP = 30;
const EVENT_TOP_WITH_LUNAR = 44;

export function MonthView({
  month,
  selected,
  onSelect,
  marksByDate = {},
  stickersByDate = {},
  dayCellMinHeight = 58,
  fillAvailableSpace = false,
  weekStart = 'sunday',
  showWeekNumbers = false,
  showLunar = false,
  colorSaturday = true,
}: MonthViewProps) {
  const { colors, scheme } = useTheme();
  const weeks = buildMonthMatrix(month, weekStart);
  const labels = weekdayLabels(weekStart);
  const today = new Date();
  const eventTop = showLunar ? EVENT_TOP_WITH_LUNAR : EVENT_TOP;

  return (
    <View style={[styles.wrap, fillAvailableSpace && styles.fill]}>
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

      <View
        style={[
          styles.grid,
          { borderTopColor: colors.border },
          fillAvailableSpace && styles.gridFill,
        ]}>
        {weeks.map((week) => {
          const weekKeys = week.map(toDateKey);
          const placements = layoutWeekMarks(weekKeys, marksByDate);
          const hiddenByColumn = weekKeys.map((_, column) =>
            placements.filter(
              (placement) =>
                placement.lane >= MAX_EVENT_LANES &&
                placement.startColumn <= column &&
                placement.endColumn >= column,
            ).length,
          );

          return (
            <View
              key={toDateKey(week[0])}
              style={[
                styles.week,
                { borderBottomColor: colors.border },
                fillAvailableSpace && styles.weekFill,
              ]}>
              {showWeekNumbers ? (
                <View style={styles.weekNumberCell}>
                  <Txt variant="micro" tone="tertiary">
                    {isoWeekNumber(week[0])}
                  </Txt>
                </View>
              ) : null}
              <View style={styles.weekDays}>
              {week.map((date, column) => {
                const outside = !isSameMonth(date, month);
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selected);
                const stickerMarks = stickersByDate[toDateKey(date)] ?? [];
                const sticker = stickerByKey(stickerMarks[0]?.stickerKey);
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
                      { minHeight: fillAvailableSpace ? 0 : dayCellMinHeight },
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

                    {hiddenByColumn[column] > 0 ? (
                      <Txt
                        variant="caption"
                        tone="tertiary"
                        style={[
                          styles.more,
                          {
                            top:
                              eventTop +
                              MAX_EVENT_LANES * (EVENT_ROW_HEIGHT + EVENT_ROW_GAP),
                          },
                        ]}>
                        +{hiddenByColumn[column]}
                      </Txt>
                    ) : null}

                    {sticker ? (
                      <View pointerEvents="none" style={styles.stickerWrap}>
                        <Image
                          source={sticker.cutoutSource}
                          style={styles.stickerImage}
                          contentFit="contain"
                        />
                        {stickerMarks.length > 1 ? (
                          <View style={[styles.stickerCount, { backgroundColor: colors.surface }]}>
                            <Txt variant="micro" style={styles.stickerCountText}>
                              +{stickerMarks.length - 1}
                            </Txt>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {placements
                  .filter((placement) => placement.lane < MAX_EVENT_LANES)
                  .map((placement) => {
                    const { mark } = placement;
                    const markColor = calendarColorForScheme(mark.color, scheme);
                    const filled = mark.isAllDay || placement.isSpanning;

                    return (
                      <View
                        key={mark.id}
                        style={[
                          styles.eventMark,
                          {
                            left: `${(placement.startColumn / 7) * 100}%`,
                            right: `${((6 - placement.endColumn) / 7) * 100}%`,
                            top:
                              eventTop + placement.lane * (EVENT_ROW_HEIGHT + EVENT_ROW_GAP),
                            marginLeft: placement.continuesBefore ? 0 : 2,
                            marginRight: placement.continuesAfter ? 0 : 2,
                          },
                          filled
                            ? [
                                styles.allDayMark,
                                {
                                  backgroundColor: markColor,
                                  borderTopLeftRadius: placement.continuesBefore ? 0 : 4,
                                  borderBottomLeftRadius: placement.continuesBefore ? 0 : 4,
                                  borderTopRightRadius: placement.continuesAfter ? 0 : 4,
                                  borderBottomRightRadius: placement.continuesAfter ? 0 : 4,
                                },
                              ]
                            : styles.timedMark,
                        ]}>
                        {!filled ? (
                          <View
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                            style={[styles.timedMarkLine, { backgroundColor: markColor }]}
                          />
                        ) : null}
                        <Txt
                          variant="caption"
                          numberOfLines={1}
                          style={[
                            styles.eventMarkText,
                            { color: filled ? onColor(mark.color, scheme) : colors.text },
                          ]}>
                          {placement.continuesBefore ? '‹ ' : ''}
                          {mark.title}
                          {placement.continuesAfter ? ' ›' : ''}
                        </Txt>
                      </View>
                    );
                  })}
              </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  fill: { flex: 1, minHeight: 0 },
  weekdayRow: { flexDirection: 'row' },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: Spacing.xs },
  weekNumberCell: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.xs,
  },
  grid: { borderTopWidth: StyleSheet.hairlineWidth },
  gridFill: { flex: 1, minHeight: 0 },
  week: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  weekFill: { flex: 1, minHeight: 0 },
  weekDays: { flex: 1, flexDirection: 'row', position: 'relative' },
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
  eventMark: {
    position: 'absolute',
    height: EVENT_ROW_HEIGHT,
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 2,
  },
  allDayMark: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  timedMark: { gap: 3, paddingRight: 2 },
  timedMarkLine: {
    alignSelf: 'stretch',
    width: 2,
    minHeight: 14,
    borderRadius: Radius.pill,
  },
  eventMarkText: { flex: 1, fontSize: 10, lineHeight: 14 },
  more: { position: 'absolute', left: 4, fontSize: 10, lineHeight: 12 },
  stickerWrap: {
    position: 'absolute',
    left: 2,
    bottom: 2,
    width: 42,
    height: 42,
    zIndex: 3,
  },
  stickerImage: { width: 42, height: 42 },
  stickerCount: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerCountText: { fontSize: 9, lineHeight: 11 },
});
