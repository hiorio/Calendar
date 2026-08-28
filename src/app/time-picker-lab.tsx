import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { TimePickerLabPicker } from '@/features/experiments/time-picker-lab-picker';
import type { TimePickerLabVariant } from '@/features/experiments/time-picker-lab-picker.types';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/event-time';

type VariantCardProps = {
  badge: string;
  title: string;
  description: string;
  example: string;
  buttonLabel: string;
  onOpen: () => void;
};

function currentMinute(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function VariantCard({
  badge,
  title,
  description,
  example,
  buttonLabel,
  onOpen,
}: VariantCardProps) {
  const { colors } = useTheme();

  return (
    <Card style={styles.variantCard}>
      <View style={styles.variantHeader}>
        <View style={[styles.variantBadge, { backgroundColor: colors.accentSoft }]}>
          <Txt variant="label" tone="accent">
            {badge}
          </Txt>
        </View>
        <Txt variant="subtitle" style={styles.variantTitle}>
          {title}
        </Txt>
      </View>
      <Txt variant="body" tone="secondary">
        {description}
      </Txt>
      <View
        style={[
          styles.example,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        ]}>
        <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
        <Txt variant="label">{example}</Txt>
      </View>
      <Button label={buttonLabel} size="md" variant="secondary" onPress={onOpen} />
    </Card>
  );
}

export default function TimePickerLabScreen() {
  const { colors } = useTheme();
  const [value, setValue] = useState(currentMinute);
  const [openVariant, setOpenVariant] = useState<TimePickerLabVariant | null>(null);

  if (Platform.OS !== 'ios') {
    return (
      <Content style={[styles.unsupported, { backgroundColor: colors.background }]}>
        <Ionicons name="phone-portrait-outline" size={40} color={colors.textTertiary} />
        <Txt variant="subtitle">iPhone 전용 실험입니다</Txt>
        <Txt variant="body" tone="secondary" style={styles.centerText}>
          SwiftUI 휠의 실제 조작감을 확인하는 화면이라 iOS 테스트 빌드에서만 사용할 수 있습니다.
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
          <View style={[styles.labIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="flask-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.introText}>
            <Txt variant="display">시간 선택기 실험실</Txt>
            <Txt variant="body" tone="secondary">
              세 가지 조작감을 비교합니다. 결과는 실제 일정에 저장되지 않습니다.
            </Txt>
          </View>
        </View>

        <VariantCard
          badge="A안"
          title="0~9가 빠르게 자동 확장"
          description="10분 단위를 움직이면 오른쪽에 0~9의 1분 자리 휠이 바로 나타납니다."
          example="30 선택 → 0~9 등장 → 30 + 7 = 37분"
          buttonLabel="A안 다이얼 열기"
          onOpen={() => setOpenVariant('digit-auto')}
        />

        <VariantCard
          badge="B안"
          title="숫자를 더해 바로 조합"
          description="10분 단위와 0~9의 1분 자리 휠을 항상 함께 보며 시간을 조합합니다."
          example="30 + 7 = 37분"
          buttonLabel="B안 다이얼 열기"
          onOpen={() => setOpenVariant('digit-composed')}
        />

        <VariantCard
          badge="C안"
          title="길게 눌러 오른쪽으로 펼침"
          description="10분 값을 고르고 손을 뗀 뒤 같은 휠을 0.6초 길게 누르면 0~9가 튀어나옵니다."
          example="30 선택 · 손 떼기 · 길게 누르기 → 0~9"
          buttonLabel="C안 다이얼 열기"
          onOpen={() => setOpenVariant('digit-hold')}
        />

        <Card padded={false}>
          <ListRow
            title="마지막 실험 결과"
            subtitle="세 안이 같은 결과값을 공유합니다"
            value={formatTime(value)}
          />
          <Divider />
          <View style={styles.resetAction}>
            <Button
              label="현재 시각으로 초기화"
              size="md"
              variant="ghost"
              onPress={() => setValue(currentMinute())}
            />
          </View>
        </Card>

        <View
          style={[
            styles.checklist,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}>
          <Txt variant="label">테스터에서 볼 것</Txt>
          <Txt variant="caption" tone="secondary">
            A안의 0~9가 빠르게 열리는지 · 오른쪽 휠이 나와도 기존 세 휠이 움직이지 않는지 ·
            C안에서 스크롤만 했을 때 열리지 않고 길게 눌렀을 때만 열리는지 확인해 주세요.
          </Txt>
        </View>
      </Content>

      {openVariant ? (
        <TimePickerLabPicker
          value={value}
          variant={openVariant}
          onCancel={() => setOpenVariant(null)}
          onConfirm={(next) => {
            setValue(next);
            setOpenVariant(null);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxxl },
  content: { gap: Spacing.lg, padding: Spacing.xl },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  labIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  introText: { flex: 1, gap: Spacing.xs },
  variantCard: { gap: Spacing.md },
  variantHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  variantBadge: {
    minWidth: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
  },
  variantTitle: { flex: 1 },
  example: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  resetAction: { padding: Spacing.sm },
  checklist: {
    gap: Spacing.xs,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  unsupported: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  centerText: { textAlign: 'center' },
});
