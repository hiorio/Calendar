import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import type { MyCalendar } from '@/features/calendars/queries';
import { STICKERS, type StickerKey } from '@/features/stickers/catalog';
import {
  useRemoveDaySticker,
  useSetDaySticker,
  type DaySticker,
} from '@/features/stickers/queries';
import { useTheme } from '@/hooks/use-theme';

type StickerPickerProps = {
  visible: boolean;
  date: string;
  dateLabel: string;
  calendars: MyCalendar[];
  dayStickers: DaySticker[];
  calendarsPending: boolean;
  onClose: () => void;
  onApplied: (calendarId: string) => void;
};

export function StickerPicker({
  visible,
  date,
  dateLabel,
  calendars,
  dayStickers,
  calendarsPending,
  onClose,
  onApplied,
}: StickerPickerProps) {
  const { colors, scheme } = useTheme();
  const [step, setStep] = useState<'calendar' | 'sticker'>('calendar');
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const setSticker = useSetDaySticker(date);
  const removeSticker = useRemoveDaySticker(date);
  const pending = setSticker.isPending || removeSticker.isPending;

  function closePicker() {
    setStep('calendar');
    setSelectedCalendarId(null);
    onClose();
  }

  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [calendars, selectedCalendarId],
  );
  const currentSticker =
    dayStickers.find((sticker) => sticker.calendarId === selectedCalendarId) ?? null;

  function chooseCalendar(calendarId: string) {
    setSelectedCalendarId(calendarId);
    setStep('sticker');
  }

  async function applySticker(stickerKey: StickerKey) {
    if (!selectedCalendarId) return;
    try {
      await setSticker.mutateAsync({ calendarId: selectedCalendarId, stickerKey });
      onApplied(selectedCalendarId);
      closePicker();
    } catch (error) {
      Alert.alert(
        '스티커를 적용하지 못했습니다',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function removeCurrentSticker() {
    if (!selectedCalendarId) return;
    try {
      await removeSticker.mutateAsync(selectedCalendarId);
      onApplied(selectedCalendarId);
      closePicker();
    } catch (error) {
      Alert.alert(
        '스티커를 제거하지 못했습니다',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={closePicker}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}>
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel="스티커 선택 닫기"
          onPress={closePicker}
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

          <View style={styles.sheetHeader}>
            <View style={styles.headerSide}>
              {step === 'sticker' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="캘린더 다시 선택"
                  disabled={pending}
                  hitSlop={8}
                  onPress={() => setStep('calendar')}
                  style={({ pressed }) => [
                    styles.iconButton,
                    { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
                  ]}>
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>
              ) : (
                <View style={[styles.iconButton, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                </View>
              )}
            </View>
            <View style={styles.sheetTitle}>
              <Txt variant="subtitle">
                {step === 'calendar' ? '어느 캘린더에 꾸밀까요?' : '스티커를 골라주세요'}
              </Txt>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {step === 'calendar'
                  ? `${dateLabel} · 선택한 캘린더 구성원과 함께 보여요`
                  : selectedCalendar?.name}
              </Txt>
            </View>
            <View style={[styles.headerSide, styles.headerSideEnd]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닫기"
                disabled={pending}
                hitSlop={8}
                onPress={closePicker}
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
                ]}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {step === 'calendar' ? (
            <ScrollView
              contentContainerStyle={styles.calendarList}
              showsVerticalScrollIndicator={false}>
              {calendarsPending ? (
                <ActivityIndicator color={colors.accent} style={styles.loading} />
              ) : calendars.length === 0 ? (
                <View style={styles.empty}>
                  <Txt variant="body" tone="secondary">
                    꾸밀 수 있는 캘린더가 없습니다
                  </Txt>
                </View>
              ) : (
                calendars.map((calendar) => {
                  const existing = dayStickers.find(
                    (sticker) => sticker.calendarId === calendar.id,
                  );
                  return (
                    <Pressable
                      key={calendar.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${calendar.name} 캘린더 선택`}
                      onPress={() => chooseCalendar(calendar.id)}
                      style={({ pressed }) => [
                        styles.calendarRow,
                        {
                          backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
                          borderColor: colors.border,
                        },
                      ]}>
                      <View
                        style={[
                          styles.calendarDot,
                          {
                            backgroundColor: calendarColorForScheme(calendar.color, scheme),
                          },
                        ]}
                      />
                      <View style={styles.calendarText}>
                        <Txt variant="bodyStrong">{calendar.name}</Txt>
                        <Txt variant="caption" tone="secondary">
                          {existing ? '이 날짜에 스티커 적용 중' : '스티커 없음'}
                        </Txt>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={colors.textTertiary}
                      />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={styles.stickerGrid}
                showsVerticalScrollIndicator={false}>
                {STICKERS.map((sticker) => {
                  const selected = currentSticker?.stickerKey === sticker.key;
                  return (
                    <Pressable
                      key={sticker.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${sticker.label} 스티커 적용`}
                      accessibilityState={{ selected, disabled: pending }}
                      disabled={pending}
                      onPress={() => void applySticker(sticker.key)}
                      style={styles.stickerOption}>
                      <View
                        style={[
                          styles.stickerImageFrame,
                          {
                            backgroundColor:
                              sticker.display === 'cutout'
                                ? colors.accentSoft
                                : colors.surfaceMuted,
                            borderColor: selected ? colors.accent : colors.border,
                            opacity: pending ? 0.6 : 1,
                          },
                        ]}>
                        <Image
                          contentFit={sticker.display === 'cutout' ? 'contain' : 'cover'}
                          source={sticker.source}
                          style={styles.stickerImage}
                          transition={120}
                        />
                        {selected ? (
                          <View
                            style={[
                              styles.selectedBadge,
                              { backgroundColor: colors.accent },
                            ]}>
                            <Ionicons name="checkmark" size={14} color={colors.onAccent} />
                          </View>
                        ) : null}
                      </View>
                      <Txt variant="caption" numberOfLines={1}>
                        {sticker.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {currentSticker ? (
                <View style={[styles.removeArea, { borderColor: colors.border }]}>
                  <Button
                    block
                    disabled={pending}
                    label="이 캘린더의 스티커 제거"
                    loading={removeSticker.isPending}
                    onPress={() => void removeCurrentSticker()}
                    size="md"
                    variant="ghost"
                  />
                </View>
              ) : null}
            </>
          )}
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
    maxHeight: '78%',
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
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerSide: { width: 40 },
  headerSideEnd: { alignItems: 'flex-end' },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  sheetTitle: { flex: 1, alignItems: 'center', gap: 1 },
  calendarList: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  calendarRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  calendarDot: { width: 12, height: 38, borderRadius: Radius.pill },
  calendarText: { flex: 1, gap: 1 },
  loading: { paddingVertical: Spacing.xxxl },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  stickerOption: { width: '30%', alignItems: 'center', gap: Spacing.xs },
  stickerImageFrame: {
    width: '100%',
    aspectRatio: 0.76,
    overflow: 'hidden',
    borderWidth: 2,
    borderRadius: Radius.md,
  },
  stickerImage: { width: '100%', height: '100%' },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  removeArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
