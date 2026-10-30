import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCalendarPreference } from '@/stores/calendar-preference';

export default function CalendarDisplaySettingsScreen() {
  const { colors } = useTheme();
  const {
    weekStart, showWeekNumbers, showLunar, showTimeZone, colorSaturday,
    setWeekStart, setShowWeekNumbers, setShowLunar, setShowTimeZone, setColorSaturday,
  } = useCalendarPreference();

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>
      <Content style={styles.content}>
        <View style={styles.section}>
          <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>달력 표시</Txt>
          <Card padded={false}>
            <ListRow
              title="한 주의 시작"
              value={weekStart === 'sunday' ? '일요일' : '월요일'}
              onPress={() => setWeekStart(weekStart === 'sunday' ? 'monday' : 'sunday')}
            />
            <Divider />
            <SwitchRow title="주 번호" subtitle="월간 캘린더 왼쪽에 ISO 주 번호 표시" value={showWeekNumbers} onValueChange={setShowWeekNumbers} />
            <Divider />
            <SwitchRow title="음력" subtitle="날짜 아래에 음력 일을 함께 표시" value={showLunar} onValueChange={setShowLunar} />
            <Divider />
            <SwitchRow title="토요일을 파란색으로" value={colorSaturday} onValueChange={setColorSaturday} />
          </Card>
        </View>
        <View style={styles.section}>
          <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>일정 표시</Txt>
          <Card padded={false}>
            <SwitchRow title="시간대 표시" subtitle="일정 상세에서 일정 기준 시간대를 함께 표시" value={showTimeZone} onValueChange={setShowTimeZone} />
          </Card>
        </View>
      </Content>
    </ScrollView>
  );
}

function SwitchRow({ title, subtitle, value, onValueChange }: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow title={title} subtitle={subtitle} right={
      <Switch accessibilityLabel={title} value={value} onValueChange={onValueChange}
        trackColor={{ true: colors.accent, false: colors.surfaceMuted }} />
    } />
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
});
