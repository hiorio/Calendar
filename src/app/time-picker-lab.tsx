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
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/event-time';

function currentMinute(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

export default function TimePickerLabScreen() {
  const { colors } = useTheme();
  const [value, setValue] = useState(currentMinute);
  const [open, setOpen] = useState(false);

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
              A안의 조작감만 확인합니다. 실제 일정 데이터는 바뀌지 않습니다.
            </Txt>
          </View>
        </View>

        <Card style={styles.guideCard}>
          <Txt variant="subtitle">A안 동작</Txt>
          <View style={styles.guideRow}>
            <View style={[styles.step, { backgroundColor: colors.accent }]}>
              <Txt variant="caption" tone="onAccent">1</Txt>
            </View>
            <Txt variant="body" style={styles.guideText}>
              오전·오후, 시, 00·10·20·30·40·50을 먼저 고릅니다.
            </Txt>
          </View>
          <View style={styles.guideRow}>
            <View style={[styles.step, { backgroundColor: colors.accent }]}>
              <Txt variant="caption" tone="onAccent">2</Txt>
            </View>
            <Txt variant="body" style={styles.guideText}>
              10분 휠을 움직이면 오른쪽에 해당 구간의 1분 휠이 자동으로 나타납니다.
            </Txt>
          </View>
        </Card>

        <Card padded={false}>
          <ListRow title="실험 결과" subtitle="아직 실제 일정에는 적용되지 않습니다" value={formatTime(value)} />
          <Divider />
          <View style={styles.actions}>
            <Button label="A안 다이얼 열기" onPress={() => setOpen(true)} />
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
            휠이 나타날 때 화면이 거슬리게 움직이는지 · 원하는 분까지 빨리 도달하는지 ·
            59분과 오전/오후 전환이 자연스러운지 확인해 주세요.
          </Txt>
        </View>
      </Content>

      {open ? (
        <TimePickerLabPicker
          value={value}
          onCancel={() => setOpen(false)}
          onConfirm={(next) => {
            setValue(next);
            setOpen(false);
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
  guideCard: { gap: Spacing.md },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  guideText: { flex: 1 },
  step: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  actions: { gap: Spacing.sm, padding: Spacing.lg },
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
