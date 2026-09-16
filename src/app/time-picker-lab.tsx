import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateTimeField } from '@/components/ui/date-time-field';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import {
  TIME_PICKER_STYLE_LABELS,
  type TimePickerStyle,
} from '@/features/events/time-picker-style';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/event-time';
import { useTimePickerPreference } from '@/stores/time-picker-preference';

type StyleDefinition = {
  id: TimePickerStyle;
  title: string;
  description: string;
  example: string;
};

const STYLE_DEFINITIONS: readonly StyleDefinition[] = [
  {
    id: 'system',
    title: 'iPhone 기본 선택기',
    description: '지금까지 사용하던 iPhone의 기본 시각 선택기를 그대로 사용합니다.',
    example: '시각을 눌러 오전·오후·시·분 선택',
  },
  {
    id: 'digit-auto',
    title: '0~9가 빠르게 자동 확장',
    description: '10분 단위를 움직이면 오른쪽에 0~9의 1분 자리 휠이 바로 나타납니다.',
    example: '30 선택 → 0~9 등장 → 30 + 7 = 37분',
  },
  {
    id: 'digit-composed',
    title: '숫자를 더해 바로 조합',
    description: '10분 단위와 0~9의 1분 자리 휠을 항상 함께 보며 시간을 조합합니다.',
    example: '30 + 7 = 37분',
  },
];

function currentMinute(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function TimePickerStyleCard({
  definition,
  selected,
  previewValue,
  onPreviewChange,
  onSelect,
}: {
  definition: StyleDefinition;
  selected: boolean;
  previewValue: Date;
  onPreviewChange: (value: Date) => void;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const label = TIME_PICKER_STYLE_LABELS[definition.id];

  return (
    <Card style={[styles.styleCard, selected && { borderColor: colors.accent }]}>
      <Pressable
        accessibilityHint={selected ? '현재 사용 중입니다' : '이 방식을 일정 입력에 사용합니다'}
        accessibilityLabel={`${label} ${definition.title}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onSelect}
        style={({ pressed }) => [styles.cardHeader, pressed && styles.cardHeaderPressed]}>
        <View style={[styles.styleBadge, { backgroundColor: colors.accentSoft }]}>
          <Txt variant="label" tone="accent">
            {label}
          </Txt>
        </View>
        <View style={styles.cardTitle}>
          <Txt variant="subtitle">{definition.title}</Txt>
          {selected ? (
            <Txt variant="micro" tone="accent">
              현재 일정 입력에 사용 중
            </Txt>
          ) : null}
        </View>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? colors.accent : colors.textTertiary}
        />
      </Pressable>

      <Txt variant="body" tone="secondary">
        {definition.description}
      </Txt>

      <View
        style={[
          styles.example,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        ]}>
        <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
        <Txt variant="caption" style={styles.exampleText}>
          {definition.example}
        </Txt>
      </View>

      <View
        style={[
          styles.preview,
          { backgroundColor: colors.accentSoft, borderColor: colors.border },
        ]}>
        <View style={styles.previewCopy}>
          <Txt variant="label">직접 써보기</Txt>
          <Txt variant="micro" tone="secondary">
            오른쪽 시각을 눌러 실제 다이얼을 조작하세요.
          </Txt>
        </View>
        <DateTimeField
          hideLabel
          label={`${label} 체험 시각`}
          mode="time"
          value={previewValue}
          timePickerPurpose="preview"
          timePickerStyleOverride={definition.id}
          onChange={onPreviewChange}
        />
      </View>

      <Button
        disabled={selected}
        label={selected ? '현재 사용 중' : '이 방식 사용'}
        size="md"
        testID={`time-picker-style-${definition.id}-select`}
        variant={selected ? 'primary' : 'secondary'}
        onPress={onSelect}
      />
    </Card>
  );
}

export default function TimePickerStyleScreen() {
  const { colors } = useTheme();
  const [previewValue, setPreviewValue] = useState(currentMinute);
  const selectedStyle = useTimePickerPreference((state) => state.style);
  const setSelectedStyle = useTimePickerPreference((state) => state.setStyle);

  if (Platform.OS !== 'ios') {
    return (
      <Content style={[styles.unsupported, { backgroundColor: colors.background }]}>
        <Ionicons name="phone-portrait-outline" size={40} color={colors.textTertiary} />
        <Txt variant="subtitle">iPhone에서 설정할 수 있습니다</Txt>
        <Txt variant="body" tone="secondary" style={styles.centerText}>
          iPhone용 시각 선택 방식을 비교하고 고르는 화면입니다.
        </Txt>
      </Content>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="time-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.introText}>
            <Txt variant="display">다이얼을 직접 비교하세요</Txt>
            <Txt variant="body" tone="secondary">
              기본·A·B 타입을 같은 시각으로 사용해 본 뒤 원하는 방식을 선택할 수 있습니다.
            </Txt>
          </View>
        </View>

        <View
          style={[
            styles.guide,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Txt variant="caption" tone="secondary" style={styles.guideText}>
            다이얼을 체험하는 동안 설정은 바뀌지 않습니다. 마음에 드는 카드의 이름이나 ‘이
            방식 사용’을 눌러야 일정 입력에 적용됩니다.
          </Txt>
        </View>

        <View accessibilityRole="radiogroup" style={styles.options}>
          {STYLE_DEFINITIONS.map((definition) => (
            <TimePickerStyleCard
              key={definition.id}
              definition={definition}
              selected={selectedStyle === definition.id}
              previewValue={previewValue}
              onPreviewChange={setPreviewValue}
              onSelect={() => setSelectedStyle(definition.id)}
            />
          ))}
        </View>

        <Card style={styles.previewResult}>
          <View style={styles.previewResultCopy}>
            <Txt variant="label">공통 체험 시각</Txt>
            <Txt variant="caption" tone="secondary">
              어느 타입을 움직여도 다음 타입이 같은 시각에서 이어집니다.
            </Txt>
          </View>
          <Txt variant="subtitle" tone="accent">
            {formatTime(previewValue)}
          </Txt>
          <Button
            block={false}
            label="현재 시각으로 초기화"
            size="md"
            variant="ghost"
            onPress={() => setPreviewValue(currentMinute())}
          />
        </Card>
      </Content>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxxl },
  content: { gap: Spacing.lg, padding: Spacing.xl },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  introIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  introText: { flex: 1, gap: Spacing.xs },
  guide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  guideText: { flex: 1 },
  options: { gap: Spacing.lg },
  styleCard: { gap: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardHeaderPressed: { opacity: 0.7 },
  styleBadge: {
    minWidth: 54,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
  },
  cardTitle: { flex: 1, gap: 2 },
  example: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  exampleText: { flex: 1 },
  preview: {
    minHeight: 62,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  previewCopy: { flex: 1, minWidth: 176, gap: 2 },
  previewResult: { gap: Spacing.md },
  previewResultCopy: { gap: 2 },
  unsupported: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  centerText: { textAlign: 'center' },
});
