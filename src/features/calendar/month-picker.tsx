import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MonthPickerProps = {
  value: Date;
  onChange: (month: Date) => void;
  onClose: () => void;
};

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;
const YEAR_ROW_HEIGHT = 44;
const YEARS = Array.from(
  { length: LAST_YEAR - FIRST_YEAR + 1 },
  (_, index) => FIRST_YEAR + index,
);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function MonthPicker({
  value,
  onChange,
  onClose,
}: MonthPickerProps) {
  const { colors } = useTheme();
  const yearList = useRef<FlatList<number>>(null);
  const [year, setYear] = useState(value.getFullYear());

  function scrollToSelectedYear() {
    const index = Math.max(0, Math.min(YEARS.length - 1, year - FIRST_YEAR));
    requestAnimationFrame(() => {
      yearList.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
    });
  }

  function selectMonth(month: number) {
    onChange(new Date(year, month - 1, 1));
    onClose();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      onShow={scrollToSelectedYear}
      presentationStyle="overFullScreen"
      transparent
      visible>
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
              shadowColor: colors.shadow,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.header}>
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
                  { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
                ]}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.picker}>
            <View style={[styles.yearPanel, { borderColor: colors.border }]}>
              <FlatList
                ref={yearList}
                data={YEARS}
                getItemLayout={(_, index) => ({
                  index,
                  length: YEAR_ROW_HEIGHT,
                  offset: YEAR_ROW_HEIGHT * index,
                })}
                keyExtractor={(item) => String(item)}
                onScrollToIndexFailed={({ index }) => {
                  yearList.current?.scrollToOffset({
                    offset: YEAR_ROW_HEIGHT * index,
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
                        {
                          backgroundColor: selected
                            ? colors.accentSoft
                            : pressed
                              ? colors.surfacePressed
                              : 'transparent',
                        },
                      ]}>
                      <Txt variant={selected ? 'bodyStrong' : 'body'} tone={selected ? 'accent' : 'default'}>
                        {item}년
                      </Txt>
                    </Pressable>
                  );
                }}
                showsVerticalScrollIndicator={false}
              />
            </View>

            <View style={styles.monthPanel}>
              <Txt variant="caption" tone="secondary">
                {year}년
              </Txt>
              <View style={styles.monthGrid}>
                {MONTHS.map((month) => {
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
                        {
                          backgroundColor: selected
                            ? colors.accent
                            : pressed
                              ? colors.surfacePressed
                              : colors.surfaceMuted,
                        },
                      ]}>
                      <Txt variant="label" tone={selected ? 'onAccent' : 'default'}>
                        {month}월
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
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
  grabber: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    borderRadius: Radius.pill,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  headerSide: { width: 40 },
  headerSideEnd: { alignItems: 'flex-end' },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  picker: {
    height: 354,
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
    height: YEAR_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  monthPanel: { flex: 1, gap: Spacing.md },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  month: {
    width: '30%',
    minWidth: 54,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
});
