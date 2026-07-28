import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import {
  deviceCalendarSupported,
  getDeviceCalendars,
  requestDeviceCalendarAccess,
} from '@/features/external-calendars/device-calendar';
import { useDeviceCalendars } from '@/features/external-calendars/queries';
import { useTheme } from '@/hooks/use-theme';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';

export default function ExternalCalendarsScreen() {
  const { colors } = useTheme();
  const { connected, selectedIds, connect, toggleCalendar, disconnect } =
    useDeviceCalendarPreference();
  const calendars = useDeviceCalendars();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const permission = await requestDeviceCalendarAccess();
      if (!permission.granted) {
        Alert.alert(
          '캘린더 접근이 필요합니다',
          permission.canAskAgain
            ? '다시 연결을 눌러 접근을 허용해 주세요.'
            : 'iPhone 설정에서 TimeLine의 캘린더 접근을 전체 접근으로 바꿔 주세요.',
          permission.canAskAgain
            ? [{ text: '확인' }]
            : [
                { text: '취소', style: 'cancel' },
                { text: '설정 열기', onPress: () => void Linking.openSettings() },
              ],
        );
        return;
      }

      const available = await getDeviceCalendars();
      connect(available.map((calendar) => calendar.id));
    } catch (error) {
      Alert.alert('연결 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    Alert.alert(
      '기기 캘린더 연결을 해제할까요?',
      'TimeLine에서만 숨겨지며 iPhone의 원본 일정은 변경되지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '연결 해제', style: 'destructive', onPress: disconnect },
      ],
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">외부 캘린더</Txt>
          <Txt variant="body" tone="secondary">
            iPhone에 등록된 iCloud·Google·구독 캘린더를 TimeLine에서 함께 봅니다.
          </Txt>
        </View>

        {!deviceCalendarSupported ? (
          <Notice tone="info" title="iPhone에서 확인할 수 있습니다">
            기기 캘린더는 TestFlight 또는 개발 빌드에서 연결할 수 있습니다. 웹에서는 일정
            접근 권한을 제공하지 않습니다.
          </Notice>
        ) : !connected ? (
          <Card style={styles.connectCard}>
            <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="calendar-outline" size={28} color={colors.accent} />
            </View>
            <View style={styles.connectText}>
              <Txt variant="subtitle">기기 캘린더 연결</Txt>
              <Txt variant="caption" tone="secondary" style={styles.center}>
                권한을 허용하면 캘린더 목록을 불러옵니다. 일정은 Supabase에 업로드하거나 다른
                구성원에게 공유하지 않습니다.
              </Txt>
            </View>
            <Button label="연결하기" loading={connecting} onPress={handleConnect} />
          </Card>
        ) : (
          <>
            <Card padded={false}>
              <ListRow
                icon="checkmark-circle-outline"
                title="기기 캘린더"
                subtitle="원본을 변경하지 않는 읽기 전용 연결"
                value={`연결됨 · ${selectedIds.length}개 표시`}
              />
            </Card>

            <View style={styles.section}>
              <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>
                표시할 캘린더
              </Txt>
              <Card padded={false}>
                {calendars.data?.length ? (
                  calendars.data.map((calendar, index) => (
                    <View key={calendar.id}>
                      {index > 0 ? <Divider /> : null}
                      <ListRow
                        title={calendar.title}
                        subtitle={calendar.sourceName}
                        icon="calendar-outline"
                        right={
                          <View style={styles.rowRight}>
                            <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                            <Switch
                              accessibilityLabel={`${calendar.title} 표시`}
                              value={selectedIds.includes(calendar.id)}
                              onValueChange={() => toggleCalendar(calendar.id)}
                              trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                            />
                          </View>
                        }
                      />
                    </View>
                  ))
                ) : calendars.isPending ? (
                  <EmptyState compact icon="sync-outline" title="캘린더를 불러오는 중이에요" />
                ) : (
                  <EmptyState
                    compact
                    icon="calendar-outline"
                    title="표시할 캘린더가 없어요"
                    description="iPhone 캘린더 설정에서 iCloud 또는 다른 계정을 확인해 주세요."
                  />
                )}
              </Card>
            </View>

            {calendars.isError ? (
              <View style={styles.errorBlock}>
                <Notice tone="danger" title="캘린더를 불러오지 못했습니다">
                  {(calendars.error as Error).message}
                </Notice>
                <Button
                  label="iPhone 설정 열기"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              </View>
            ) : null}

            <Button label="연결 해제" variant="danger" onPress={handleDisconnect} />
          </>
        )}

        <Txt variant="caption" tone="tertiary">
          외부 일정은 현재 이 기기의 사용자에게만 보입니다. 공유 캘린더 구성원에게 보여 주는
          서버 연동은 별도 동의와 서비스별 인증이 필요합니다.
        </Txt>
      </Content>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  connectCard: { alignItems: 'center', gap: Spacing.lg },
  iconBadge: {
    width: 58,
    height: 58,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectText: { alignItems: 'center', gap: Spacing.xs },
  center: { textAlign: 'center' },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dot: { width: 10, height: 10, borderRadius: Radius.pill },
  errorBlock: { gap: Spacing.md },
});
