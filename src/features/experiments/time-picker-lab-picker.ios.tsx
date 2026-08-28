import { Host, HStack, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityHint,
  accessibilityIdentifier,
  accessibilityLabel,
  accessibilityValue,
  disabled,
  frame,
  labelsHidden,
  monospacedDigit,
  onLongPressGesture,
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  applyTimePickerParts,
  composeMinute,
  exactMinuteOptions,
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
const ABSOLUTE_PICKER_WIDTH = 248;
const DIGIT_PICKER_WIDTH = 266;
const HOLD_DURATION_SECONDS = 0.6;
const PICKER_EDGE_INSET = Spacing.sm;

type VariantConfig = {
  title: string;
  usesDigit: boolean;
  reveal: 'automatic' | 'always' | 'long-press';
};

const VARIANT_CONFIG: Record<TimePickerLabVariant, VariantConfig> = {
  'absolute-auto': {
    title: 'A안 · 범위 분 다이얼',
    usesDigit: false,
    reveal: 'automatic',
  },
  'digit-composed': {
    title: 'B안 · 10분 + 1분 조합',
    usesDigit: true,
    reveal: 'always',
  },
  'digit-hold': {
    title: 'C안 · 길게 눌러 확장',
    usesDigit: true,
    reveal: 'long-press',
  },
};

export function TimePickerLabPicker({
  value,
  variant,
  onCancel,
  onConfirm,
}: TimePickerLabPickerProps) {
  const { colors, scheme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const config = VARIANT_CONFIG[variant];
  const variantLabel =
    variant === 'absolute-auto' ? 'A안' : variant === 'digit-composed' ? 'B안' : 'C안';
  const initial = timePickerParts(value);
  const [meridiem, setMeridiem] = useState(initial.meridiem);
  const [hour12, setHour12] = useState(initial.hour12);
  const [coarseMinute, setCoarseMinute] = useState(initial.coarseMinute);
  const [fineSelection, setFineSelection] = useState(
    config.usesDigit ? initial.minute % 10 : initial.minute,
  );
  const [fineVisible, setFineVisible] = useState(config.reveal === 'always');
  const minute = config.usesDigit
    ? composeMinute(coarseMinute, fineSelection)
    : fineSelection;
  const fineMinuteOptions = config.usesDigit
    ? minuteDigitOptions()
    : exactMinuteOptions(coarseMinute);
  const expandedWidth = config.usesDigit ? DIGIT_PICKER_WIDTH : ABSOLUTE_PICKER_WIDTH;
  const availableWidth = Math.min(windowWidth, MaxContentWidth);
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

  function revealFineMinute(announcedCoarseMinute = coarseMinute) {
    if (fineVisible) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFineVisible(true);
    requestAnimationFrame(() => {
      const message = config.usesDigit
        ? '오른쪽에 0부터 9까지 고르는 1분 자리 다이얼이 열렸습니다'
        : `${announcedCoarseMinute}분부터 ${announcedCoarseMinute + 9}분까지 고르는 세부 분 다이얼이 열렸습니다`;
      AccessibilityInfo.announceForAccessibility(message);
    });
  }

  function selectCoarseMinute(next: number) {
    setCoarseMinute(next);
    if (!config.usesDigit) {
      setFineSelection(next);
    }

    if (config.reveal === 'automatic') {
      revealFineMinute(next);
    }
  }

  const coarseModifiers = [
    pickerStyle('wheel'),
    labelsHidden(),
    frame({ width: 64, height: PICKER_HEIGHT }),
    accessibilityIdentifier(`time-picker-${variant}-coarse-minute`),
    accessibilityLabel(`${variantLabel} 10분 단위`),
    accessibilityValue(`${coarseMinute}분대`),
    ...(config.reveal === 'long-press'
      ? [
          accessibilityHint(
            '값을 고르고 손을 뗀 뒤 다시 길게 누르면 오른쪽에 1분 자리 선택기가 열립니다',
          ),
          onLongPressGesture(() => revealFineMinute(), HOLD_DURATION_SECONDS),
        ]
      : []),
  ];

  const headerDescription = (() => {
    if (config.reveal === 'long-press' && !fineVisible) {
      return '10분 휠을 고르고 손을 뗀 뒤, 같은 휠을 0.6초 길게 누르세요';
    }
    if (!fineVisible) {
      return '10분 휠을 움직이면 오른쪽에 세부 분이 나타납니다';
    }
    if (config.usesDigit) {
      return `${coarseMinute} + ${fineSelection} = ${minute}분으로 선택됩니다`;
    }
    return `${coarseMinute}~${coarseMinute + 9}분 중 정확한 분을 고르세요`;
  })();

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
              <Txt variant="subtitle">{config.title}</Txt>
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
            <View
              style={[
                styles.pickerClip,
                {
                  left: pickerLeft,
                  width: fineVisible ? expandedWidth : BASE_PICKER_WIDTH,
                },
              ]}>
              <Host
                colorScheme={scheme}
                seedColor={colors.accent}
                style={[styles.pickerHost, { width: expandedWidth }]}>
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
                    modifiers={coarseModifiers}>
                    {COARSE_MINUTE_OPTIONS.map((option) => (
                      <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                        {`${option}`.padStart(2, '0')}
                      </SwiftText>
                    ))}
                  </Picker>

                  {config.usesDigit ? (
                    <SwiftText
                      modifiers={[
                        frame({ width: 18, height: PICKER_HEIGHT }),
                        accessibilityHidden(),
                      ]}>
                      ＋
                    </SwiftText>
                  ) : null}

                  <Picker<number>
                    key={config.usesDigit ? 'digit' : `absolute-${coarseMinute}`}
                    label={config.usesDigit ? '1분 자리' : '세부 분'}
                    selection={fineSelection}
                    onSelectionChange={setFineSelection}
                    modifiers={[
                      pickerStyle('wheel'),
                      labelsHidden(),
                      frame({ width: 64, height: PICKER_HEIGHT }),
                      disabled(!fineVisible),
                      accessibilityHidden(!fineVisible),
                      accessibilityIdentifier(`time-picker-${variant}-fine-minute`),
                      accessibilityLabel(
                        `${variantLabel} ${config.usesDigit ? '1분 숫자' : '세부 분'}`,
                      ),
                      accessibilityValue(
                        config.usesDigit
                          ? `${fineSelection}, 최종 ${minute}분`
                          : `${minute}분`,
                      ),
                    ]}>
                    {fineMinuteOptions.map((option) => (
                      <SwiftText key={option} modifiers={[tag(option), monospacedDigit()]}>
                        {config.usesDigit ? `${option}` : `${option}`.padStart(2, '0')}
                      </SwiftText>
                    ))}
                  </Picker>
                </HStack>
              </Host>
            </View>
          </View>

          {config.usesDigit ? (
            <View
              style={[
                styles.relation,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}>
              <Ionicons
                name={fineVisible ? 'link-outline' : 'hand-left-outline'}
                size={16}
                color={fineVisible ? colors.accent : colors.textSecondary}
              />
              <Txt variant="caption" tone="secondary" style={styles.relationText}>
                {fineVisible
                  ? `${coarseMinute}분대와 오른쪽 ${fineSelection}을 합쳐 ${minute}분`
                  : '선택을 마치고 손을 뗀 뒤 10분 휠을 다시 길게 눌러 연결합니다'}
              </Txt>
              {!fineVisible && config.reveal === 'long-press' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="1분 자리 직접 열기"
                  hitSlop={8}
                  onPress={() => revealFineMinute()}
                  style={({ pressed }) => [
                    styles.revealButton,
                    { backgroundColor: pressed ? colors.accentPressed : colors.accent },
                  ]}>
                  <Txt variant="micro" tone="onAccent">
                    직접 열기
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          ) : null}

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
    minHeight: 78,
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
  revealButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  action: { flex: 1 },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
});
