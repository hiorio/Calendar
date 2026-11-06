import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import { useTheme } from '@/hooks/use-theme';

export default function CalendarsScreen() {
  const { colors, scheme } = useTheme();
  const calendars = useMyCalendars();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Content style={styles.content}>
          {calendars.isPending ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : calendars.data?.length ? (
            <Card padded={false}>
              {calendars.data.map((calendar, index) => (
                <View key={calendar.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={calendar.name}
                    subtitle={`구성원 ${calendar.memberCount}명${calendar.role === 'OWNER' ? ' · 내가 만든 캘린더' : ''}`}
                    right={
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                        ]}
                      />
                    }
                    onPress={() =>
                      router.push({ pathname: '/calendar/[id]', params: { id: calendar.id } })
                    }
                  />
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon="people-outline"
                title="아직 캘린더가 없어요"
                description="첫 캘린더를 만들고 초대 링크를 보내보세요."
              />
            </Card>
          )}

          <Button label="새 캘린더 만들기" onPress={() => router.push('/calendar-new')} />

          <Txt variant="caption" tone="tertiary" style={styles.note}>
            캘린더를 나가려면 각 캘린더를 눌러 설정에서 진행합니다.
          </Txt>
        </Content>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingVertical: Spacing.xl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  loading: { paddingVertical: Spacing.xxxl },
  dot: { width: 12, height: 12, borderRadius: Radius.pill },
  note: { textAlign: 'center' },
});
