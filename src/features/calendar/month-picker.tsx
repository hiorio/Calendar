import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_SIZE_SCALES } from '@/components/ui/preferred-text-style';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/stores/theme-preference';

type MonthPickerProps = {
  value: Date;
  onChange: (month: Date) => void;
  onClose: () => void;
};

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const MONTH_ROWS = Array.from({ length: 4 }, (_, row) => MONTHS.slice(row * 3, row * 3 + 3));

export function MonthPicker({ value, onChange, onClose }: MonthPickerProps) {
  const { colors } = useTheme();
  const { fontScale, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontSizePreference = useThemePreference((state) => state.fontSizePreference);
  const yearList = useRef<FlatList<number>>(null);
  const [year, setYear] = useState(value.getFullYear());
  const textScale = fontScale * FONT_SIZE_SCALES[fontSizePreference];
  const yearRowHeight = Math.max(
    44,
    Math.ceil(Typography.body.lineHeight * textScale + Spacing.md * 2),
  );
  const monthRowMinHeight = Math.max(
    48,
    Math.ceil(Typography.label.lineHeight * textScale + Spacing.md * 2),
  );
  const headerHeight = Math.max(
    58,
    Math.ceil(Typography.subtitle.lineHeight * textScale + Spacing.sm),
  );
  const monthContentHeight =
    Math.ceil(Typography.caption.lineHeight * textScale) +
    Spacing.md +
    MONTH_ROWS.length * monthRowMinHeight +
    (MONTH_ROWS.length - 1) * Spacing.sm;
  const sheetMaxHeight = Math.max(0, windowHeight - insets.top);
  const pickerHeight = Math.min(
    Math.max(354, monthContentHeight + Spacing.xl),
    Math.max(0, sheetMaxHeight - headerHeight - insets.bottom),
  );

  function scrollToSelectedYear() {
    const index = Math.max(0, Math.min(YEARS.length - 1, year - FIRST_YEAR));
    requestAnimationFrame(() => {
      yearList.current?.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.5,
      });
    });
  }

  function selectMonth(month: number) {
    onChange(new Date(year, month - 1, 1));
    onClose();
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={scrollToSelectedYear}
      presentationStyle="overFullScreen"
      transparent
      visible
    >
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel="연도와 월 선택 닫기"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.shadow, opacity: 0.42 }]}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight: sheetMaxHeight,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={[styles.header, { minHeight: headerHeight }]}>
            <View style={styles.headerSide} />
            <Txt variant="subtitle">연도·월 선택</Txt>
            <View style={[styles.headerSide, styles.headerSideEnd]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닫기"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.picker, { height: pickerHeight }]}>
            <View style={[styles.yearPanel, { borderColor: colors.border }]}>
              <FlatList
                ref={yearList}
                data={YEARS}
                getItemLayout={(_, index) => ({
                  index,
                  length: yearRowHeight,
                  offset: yearRowHeight * index,
                })}
                keyExtractor={(item) => String(item)}
                onScrollToIndexFailed={({ index }) => {
                  yearList.current?.scrollToOffset({
                    offset: yearRowHeight * index,
                    animated: false,
                  });
                }}
                renderItem={({ item }) => {
                  const selected = item === year;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item}년`}
                      accessibilityState={{ selected }}
                      onPress={() => setYear(item)}
                      style={({ pressed }) => [
                        styles.year,
                        { height: yearRowHeight },
                        {
                          backgroundColor: selected
                            ? colors.accentSoft
                            : pressed
                              ? colors.surfacePressed
                              : 'transparent',
                        },
                      ]}
                    >
                      <Txt
                        variant={selected ? 'bodyStrong' : 'body'}
                        tone={selected ? 'accent' : 'default'}
                      >
                        {item}년
                      </Txt>
                    </Pressable>
                  );
                }}
                showsVerticalScrollIndicator={false}
              />
            </View>

            <ScrollView
              style={styles.monthPanel}
              contentContainerStyle={styles.monthPanelContent}
              showsVerticalScrollIndicator={false}
            >
              <Txt variant="caption" tone="secondary">
                {year}년
              </Txt>
              <View style={styles.monthGrid}>
                {MONTH_ROWS.map((months) => (
                  <View key={months[0]} style={styles.monthRow}>
                    {months.map((month) => {
                      const selected =
                        year === value.getFullYear() && month === value.getMonth() + 1;
                      return (
                        <Pressable
                          key={month}
                          accessibilityRole="button"
                          accessibilityLabel={`${year}년 ${month}월로 이동`}
                          accessibilityState={{ selected }}
                          onPress={() => selectMonth(month)}
                          style={({ pressed }) => [
                            styles.month,
                            { minHeight: monthRowMinHeight },
                            {
                              backgroundColor: selected
                                ? colors.accent
                                : pressed
                                  ? colors.surfacePressed
                                  : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Txt variant="label" tone={selected ? 'onAccent' : 'default'}>
                            {month}월
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...Elevation.floating,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  headerSide: { width: 44 },
  headerSideEnd: { alignItems: 'flex-end' },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  picker: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  yearPanel: {
    width: 116,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  year: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
  },
  monthPanel: { flex: 1 },
  monthPanelContent: { gap: Spacing.md },
  monthGrid: { gap: Spacing.sm },
  monthRow: { flexDirection: 'row', gap: Spacing.sm },
  month: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
});
