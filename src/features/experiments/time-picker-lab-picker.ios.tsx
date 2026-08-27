import { Host, HStack, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  frame,
  labelsHidden,
  monospacedDigit,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  AccessibilityInfo,
  LayoutAnimation,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  applyTimePickerParts,
  exactMinuteOptions,
  timePickerParts,
  type TimePickerMeridiem,
} from '@/features/experiments/time-picker-lab-model';
import type { TimePickerLabPickerProps } from '@/features/experiments/time-picker-lab-picker.types';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/event-time';

const MERIDIEM_OPTIONS: { label: string; value: TimePickerMeridiem }[] = [
  { label: '오전', value: 'am' },
  { label: '오후', value: 'pm' },
];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const COARSE_MINUTE_OPTIONS = Array.from({ length: 6 }, (_, index) => index * 10);
const PICKER_HEIGHT = 196;
const PICKER_WIDTH_COLLAPSED = 184;
const PICKER_WIDTH_EXPANDED = 248;

export function TimePickerLabPicker({
  value,
  onCancel,
  onConfirm,
}: TimePickerLabPickerProps) {
  const { colors, scheme } = useTheme();
  const initial = timePickerParts(value);
  const [meridiem, setMeridiem] = useState(initial.meridiem);
  const [hour12, setHour12] = useState(initial.hour12);
  const [coarseMinute, setCoarseMinute] = useState(initial.coarseMinute);
  const [minute, setMinute] = useState(initial.minute);
  const [fineVisible, setFineVisible] = useState(false);
  const fineMinuteOptions = exactMinuteOptions(coarseMinute);
  const preview = applyTimePickerParts(value, {
    meridiem,
    hour12,
    coarseMinute,
    minute,
  });

  function selectCoarseMinute(next: number) {
    setCoarseMinute(next);
    setMinute(next);

    if (!fineVisible) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFineVisible(true);
      requestAnimationFrame(() => {
        AccessibilityInfo.announceForAccessibility(
          `${next}분부터 ${next + 9}분까지 고르는 세부 분 다이얼이 열렸습니다`,
        );
      });
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      transparent
      visible>
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel="시간 선택기 실험 닫기"
          onPress={onCancel}
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
            <View style={[styles.headerIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="flask-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.headerText}>
              <Txt variant="subtitle">A안 · 10분 다음 1분</Txt>
              <Txt variant="caption" tone="secondary">
                {fineVisible
                  ? `${coarseMinute}~${coarseMinute + 9}분 중 정확한 분을 고르세요`
                  : '10분 다이얼을 움직이면 오른쪽에 세부 분이 나타납니다'}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="취소"
              hitSlop={8}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
              ]}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.preview, { backgroundColor: colors.accentSoft }]}>
            <Txt variant="caption" tone="secondary">
              현재 선택
            </Txt>
            <Txt variant="display" tone="accent">
              {formatTime(preview)}
            </Txt>
          </View>

          <View style={styles.pickerArea}>
            <Host
              colorScheme={scheme}
              seedColor={colors.accent}
              style={[
                styles.pickerHost,
                { width: fineVisible ? PICKER_WIDTH_EXPANDED : PICKER_WIDTH_COLLAPSED },
              ]}>
              <HStack spacing={0}>
                <Picker<TimePickerMeridiem>
                  label="오전 오후"
                  selection={meridiem}
                  onSelectionChange={setMeridiem}
                  modifiers={[
                    pickerStyle('wheel'),
                    labelsHidden(),
                    frame({ width: 68, height: PICKER_HEIGHT }),
                    accessibilityLabel('오전 오후'),
                    accessibilityValue(meridiem === 'am' ? '오전' : '오후'),
                  ]}>
                  {MERIDIEM_OPTIONS.map((option) => (
                    <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                      {option.label}
                    </SwiftText>
                  ))}
                </Picker>

                <Picker<number>
                  label="시"
                  selection={hour12}
                  onSelectionChange={setHour12}
                  modifiers={[
                    pickerStyle('wheel'),
                    labelsHidden(),
                    frame({ width: 52, height: PICKER_HEIGHT }),
                    accessibilityLabel('시'),
                    accessibilityValue(`${hour12}시`),
                  ]}>
                  {HOUR_OPTIONS.map((hour) => (
                    <SwiftText key={hour} modifiers={[tag(hour), monospacedDigit()]}>
                      {hour}
                    </SwiftText>
                  ))}
                </Picker>

                <Picker<number>
                  label="10분 단위"
                  selection={coarseMinute}
                  onSelectionChange={selectCoarseMinute}
                  modifiers={[
                    pickerStyle('wheel'),
                    labelsHidden(),
                    frame({ width: 64, height: PICKER_HEIGHT }),
                    accessibilityLabel('10분 단위'),
                    accessibilityValue(`${coarseMinute}분대`),
                  ]}>
                  {COARSE_MINUTE_OPTIONS.map((option) => (
                    <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                      {`${option}`.padStart(2, '0')}
                    </SwiftText>
                  ))}
                </Picker>

                {fineVisible ? (
                  <Picker<number>
                    key={`fine-${coarseMinute}`}
                    label="세부 분"
                    selection={minute}
                    onSelectionChange={setMinute}
                    modifiers={[
                      pickerStyle('wheel'),
                      labelsHidden(),
                      frame({ width: 64, height: PICKER_HEIGHT }),
                      accessibilityLabel('세부 분'),
                      accessibilityValue(`${minute}분`),
                    ]}>
                    {fineMinuteOptions.map((option) => (
                      <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                        {`${option}`.padStart(2, '0')}
                      </SwiftText>
                    ))}
                  </Picker>
                ) : null}
              </HStack>
            </Host>
          </View>

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="취소" size="md" variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.action}>
              <Button label="실험값 적용" size="md" onPress={() => onConfirm(preview)} />
            </View>
          </View>
          <Txt variant="caption" tone="tertiary" style={styles.disclaimer}>
            이 값은 실험 화면에만 반영되며 실제 일정에는 저장되지 않습니다.
          </Txt>
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
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  headerText: { flex: 1, gap: 1 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  preview: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  pickerArea: {
    height: PICKER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickerHost: { height: PICKER_HEIGHT, alignSelf: 'center' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  action: { flex: 1 },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
});
