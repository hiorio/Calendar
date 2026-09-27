import { Host, HStack, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityIdentifier,
  accessibilityLabel,
  accessibilityValue,
  disabled,
  frame,
  labelsHidden,
  monospacedDigit,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  applyTimePickerParts,
  composeMinute,
  minuteDigitOptions,
  timePickerParts,
  type TimePickerMeridiem,
} from '@/features/experiments/time-picker-lab-model';
import type {
  TimePickerLabPickerProps,
  TimePickerLabVariant,
} from '@/features/experiments/time-picker-lab-picker.types';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/event-time';

const MERIDIEM_OPTIONS: { label: string; value: TimePickerMeridiem }[] = [
  { label: '오전', value: 'am' },
  { label: '오후', value: 'pm' },
];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const COARSE_MINUTE_OPTIONS = Array.from({ length: 6 }, (_, index) => index * 10);
const PICKER_HEIGHT = 196;
const BASE_PICKER_WIDTH = 184;
const DIGIT_PICKER_WIDTH = 266;
const AUTO_FINE_REVEAL_DURATION_MS = 160;
const PICKER_EDGE_INSET = Spacing.sm;

type VariantConfig = {
  experimentTitle: string;
  eventTitle: string;
  reveal: 'automatic' | 'always';
};

const VARIANT_CONFIG: Record<TimePickerLabVariant, VariantConfig> = {
  'digit-auto': {
    experimentTitle: '빠른 분 선택 · A',
    eventTitle: '빠른 분 선택 · A',
    reveal: 'automatic',
  },
  'digit-composed': {
    experimentTitle: '펼친 분 선택 · B',
    eventTitle: '펼친 분 선택 · B',
    reveal: 'always',
  },
};

export function TimePickerLabPicker({
  value,
  variant,
  purpose = 'experiment',
  onCancel,
  onConfirm,
}: TimePickerLabPickerProps) {
  const { colors, scheme } = useTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const config = VARIANT_CONFIG[variant];
  const isExperiment = purpose === 'experiment';
  const isFormalPicker = !isExperiment;
  const variantLabel =
    variant === 'digit-auto'
      ? isFormalPicker
        ? '빠른 선택 A'
        : 'A안'
      : isFormalPicker
        ? '펼친 선택 B'
        : 'B안';
  const initial = timePickerParts(value);
  const [meridiem, setMeridiem] = useState(initial.meridiem);
  const [hour12, setHour12] = useState(initial.hour12);
  const [coarseMinute, setCoarseMinute] = useState(initial.coarseMinute);
  const [fineSelection, setFineSelection] = useState(initial.minute % 10);
  const [fineVisible, setFineVisible] = useState(config.reveal === 'always');
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const minute = composeMinute(coarseMinute, fineSelection);
  const fineMinuteOptions = minuteDigitOptions();
  const expandedWidth = DIGIT_PICKER_WIDTH;
  const availableWidth = Math.min(windowWidth, MaxContentWidth);
  const sheetMaxHeight = Math.max(0, windowHeight - insets.top);
  const pickerLeft = Math.min(
    availableWidth / 2 - BASE_PICKER_WIDTH / 2,
    availableWidth - expandedWidth - PICKER_EDGE_INSET,
  );
  const preview = applyTimePickerParts(value, {
    meridiem,
    hour12,
    coarseMinute,
    minute,
  });

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  function revealFineMinute() {
    if (fineVisible) return;

    if (!reduceMotionEnabled) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          AUTO_FINE_REVEAL_DURATION_MS,
          LayoutAnimation.Types.easeOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
    }
    setFineVisible(true);
    requestAnimationFrame(() => {
      AccessibilityInfo.announceForAccessibility(
        '오른쪽에 0부터 9까지 고르는 1분 자리 다이얼이 열렸습니다',
      );
    });
  }

  function selectCoarseMinute(next: number) {
    setCoarseMinute(next);

    if (config.reveal === 'automatic') {
      revealFineMinute();
    }
  }

  const coarseModifiers = [
    pickerStyle('wheel'),
    labelsHidden(),
    frame({ width: 64, height: PICKER_HEIGHT }),
    accessibilityIdentifier(`time-picker-${variant}-coarse-minute`),
    accessibilityLabel(`${variantLabel} 10분 단위`),
    accessibilityValue(`${coarseMinute}분대`),
  ];

  const headerDescription = (() => {
    if (!fineVisible) {
      return '10분 휠을 움직이면 오른쪽에 0~9가 빠르게 나타납니다';
    }
    return `${coarseMinute} + ${fineSelection} = ${minute}분으로 선택됩니다`;
  })();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      transparent
      visible
    >
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel={isFormalPicker ? '시간 선택 닫기' : '시간 선택기 실험 닫기'}
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
              maxHeight: sheetMaxHeight,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Txt variant="subtitle">
                {isFormalPicker ? config.eventTitle : config.experimentTitle}
              </Txt>
              <Txt variant="caption" tone="secondary">
                {headerDescription}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="취소"
              hitSlop={8}
              onPress={onCancel}
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

          <ScrollView
            bounces={false}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.contentScroll}
          >
            <View style={[styles.preview, { backgroundColor: colors.accentSoft }]}>
              <Txt variant="caption" tone="secondary">
                현재 선택
              </Txt>
              <Txt variant="display" tone="accent">
                {formatTime(preview)}
              </Txt>
            </View>

            <View style={styles.pickerArea}>
              <View
                style={[
                  styles.pickerClip,
                  {
                    left: pickerLeft,
                    width: fineVisible ? expandedWidth : BASE_PICKER_WIDTH,
                  },
                ]}
              >
                <Host
                  colorScheme={scheme}
                  seedColor={colors.accent}
                  style={[styles.pickerHost, { width: expandedWidth }]}
                >
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
                      ]}
                    >
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
                      ]}
                    >
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
                      modifiers={coarseModifiers}
                    >
                      {COARSE_MINUTE_OPTIONS.map((option) => (
                        <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                          {`${option}`.padStart(2, '0')}
                        </SwiftText>
                      ))}
                    </Picker>

                    <SwiftText
                      modifiers={[
                        frame({ width: 18, height: PICKER_HEIGHT }),
                        accessibilityHidden(),
                      ]}
                    >
                      ＋
                    </SwiftText>

                    <Picker<number>
                      label="1분 자리"
                      selection={fineSelection}
                      onSelectionChange={setFineSelection}
                      modifiers={[
                        pickerStyle('wheel'),
                        labelsHidden(),
                        frame({ width: 64, height: PICKER_HEIGHT }),
                        disabled(!fineVisible),
                        accessibilityHidden(!fineVisible),
                        accessibilityIdentifier(`time-picker-${variant}-fine-minute`),
                        accessibilityLabel(`${variantLabel} 1분 숫자`),
                        accessibilityValue(`${fineSelection}, 최종 ${minute}분`),
                      ]}
                    >
                      {fineMinuteOptions.map((option) => (
                        <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                          {`${option}`}
                        </SwiftText>
                      ))}
                    </Picker>
                  </HStack>
                </Host>
              </View>
            </View>

            <View
              style={[
                styles.relation,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name={fineVisible ? 'link-outline' : 'hand-left-outline'}
                size={16}
                color={fineVisible ? colors.accent : colors.textSecondary}
              />
              <Txt variant="caption" tone="secondary" style={styles.relationText}>
                {fineVisible
                  ? `${coarseMinute}분대 + 오른쪽 ${fineSelection} = ${minute}분`
                  : '10분 휠을 움직이면 오른쪽에 0~9가 열립니다'}
              </Txt>
            </View>

            {isExperiment ? (
              <Txt variant="caption" tone="tertiary" style={styles.disclaimer}>
                이 값은 실험 화면에만 반영되며 실제 일정에는 저장되지 않습니다.
              </Txt>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="취소" size="md" variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.action}>
              <Button
                label={
                  purpose === 'event'
                    ? '시간 적용'
                    : purpose === 'preview'
                      ? '체험 완료'
                      : '실험값 적용'
                }
                size="md"
                onPress={() => onConfirm(preview)}
              />
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
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  headerText: { flex: 1, gap: 1 },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  contentScroll: { flexShrink: 1 },
  preview: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  pickerArea: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  pickerClip: {
    position: 'absolute',
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  pickerHost: { height: PICKER_HEIGHT },
  relation: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  relationText: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  action: { flex: 1 },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
});
