import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars, useSetMuted } from '@/features/calendars/queries';
import {
  countRegisteredDevices,
  getDevicePushState,
  registerForPush,
  unregisterPush,
} from '@/features/notifications/push';
import { useTheme } from '@/hooks/use-theme';
import { env } from '@/lib/env';

export default function NotificationsScreen() {
  const { user } = useAuth();
  return <NotificationSettings key={user?.id ?? 'signed-out'} />;
}

function NotificationSettings() {
  const { colors, scheme } = useTheme();
  const { user } = useAuth();
  const calendars = useMyCalendars();
  const setMuted = useSetMuted();
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const changing = useRef(false);

  const device = useQuery({
    queryKey: ['push-device', user?.id],
    enabled: Boolean(user),
    queryFn: () => getDevicePushState(user!.id),
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: ['push-device'] });
    });
    return () => subscription.remove();
  }, [queryClient]);

  // 화면을 닫았다 열어도 상태가 남도록 서버에서 읽는다.
  // 로컬 state 만 쓰면 매번 "등록 안 됨"으로 보인다.
  const devices = useQuery({
    queryKey: ['device-tokens', user?.id],
    enabled: Boolean(user),
    queryFn: () => countRegisteredDevices(user!.id),
  });

  async function changeRegistration(enable: boolean) {
    if (!user || changing.current) return;
    changing.current = true;
    setChecking(true);
    setActionError(null);
    try {
      if (enable) {
        const result = await registerForPush(user.id);
        if (result.state === 'needs-build' || result.state === 'unsupported') setActionError(result.reason);
        else if (result.state === 'denied') setActionError('기기 설정에서 알림 권한을 허용해 주세요.');
      } else {
        await unregisterPush(user.id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['device-tokens', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['push-device', user.id] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      changing.current = false;
      setChecking(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">알림</Txt>
          <Txt variant="body" tone="secondary">
            함께 쓰는 사람이 일정을 넣거나 바꾸면 알려 드립니다.
          </Txt>
        </View>

        {!env.pushEnabled ? (
          <Notice tone="info" title="이 버전에서는 알림 발송이 활성화되지 않았습니다">
            앱을 최신 버전으로 업데이트해 주세요. 캘린더 변경 내용은 앱에서 확인할 수 있습니다.
          </Notice>
        ) : null}

        <View style={styles.section}>
          <Txt variant="label" tone="secondary">
            이 기기
          </Txt>

          <Card>
            <View style={styles.deviceBlock}>
              {device.isPending ? <Txt tone="secondary">이 기기의 알림 상태를 확인하고 있습니다…</Txt> : null}
              {device.isError ? (
                <>
                  <Notice tone="danger" title="이 기기의 알림 상태를 확인하지 못했습니다">{device.error.message}</Notice>
                  <Button label="다시 확인" variant="secondary" loading={device.isFetching} onPress={() => void device.refetch()} />
                </>
              ) : device.data?.supported === false ? (
                <Notice title="이 환경에서는 알림을 받을 수 없습니다">{device.data.reason}</Notice>
              ) : device.data?.supported ? (
                <>
                  <Txt variant="body" tone="secondary">
                    {device.data.permission === 'denied'
                      ? '기기 설정에서 이 앱의 알림이 허용되지 않았습니다.'
                      : device.data.registered && device.data.permission === 'allowed'
                        ? '이 기기는 알림 수신 등록이 완료됐습니다.'
                        : '이 기기의 알림이 꺼져 있습니다.'}
                  </Txt>
                  {device.data.permission === 'denied' ? (
                    <Button label="기기 알림 설정 열기" variant="secondary" onPress={() => void Linking.openSettings().catch(() => setActionError('기기 설정을 열지 못했습니다. 설정 앱에서 알림을 확인해 주세요.'))} />
                  ) : null}
                  {(!device.data.registered || device.data.permission === 'undetermined') && device.data.permission !== 'denied' ? (
                    <Button label="알림 켜기" loading={checking} onPress={() => void changeRegistration(true)} />
                  ) : null}
                  {device.data.locallyEnabled ? (
                    <Button label="이 기기 알림 끄기" variant="secondary" loading={checking} onPress={() => void changeRegistration(false)} />
                  ) : null}
                </>
              ) : null}
              {actionError ? <Notice tone="danger" title="알림 설정을 완료하지 못했습니다">{actionError}</Notice> : null}
              {devices.isError ? (
                <Txt variant="caption" tone="danger">등록된 전체 기기 수를 확인하지 못했습니다.</Txt>
              ) : devices.data !== undefined ? (
                <Txt variant="caption" tone="tertiary">이 계정에 등록된 전체 기기: {devices.data}대</Txt>
              ) : null}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Txt variant="label" tone="secondary">
            캘린더별
          </Txt>

          <Card padded={false}>
            {calendars.data && calendars.data.length > 0 ? (
              calendars.data.map((calendar, index) => (
                <View key={calendar.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={calendar.name}
                    subtitle={calendar.muted ? '알림 꺼짐' : '일정 등록·변경, 댓글'}
                    right={
                      <View style={styles.rowRight}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                          ]}
                        />
                        <Switch
                          accessibilityLabel={`${calendar.name} 캘린더 알림`}
                          value={!calendar.muted}
                          disabled={setMuted.isPending}
                          onValueChange={(on) =>
                            setMuted.mutate({ calendarId: calendar.id, muted: !on })
                          }
                          trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                        />
                      </View>
                    }
                  />
                </View>
              ))
            ) : (
              <EmptyState
                compact
                icon="calendar-outline"
                title="아직 캘린더가 없어요"
                description="캘린더를 만들면 여기에서 알림을 조절할 수 있습니다."
              />
            )}
          </Card>

          <Txt variant="caption" tone="tertiary">
            끈 캘린더의 알림은 만들어지지도 않습니다. 나중에 켜도 지난 알림은 오지 않습니다.
          </Txt>
        </View>

        {setMuted.isError ? (
          <Txt variant="caption" tone="danger">
            설정을 바꾸지 못했습니다: {(setMuted.error as Error).message}
          </Txt>
        ) : null}
      </Content>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xxl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  section: { gap: Spacing.sm },
  deviceBlock: { gap: Spacing.lg },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dot: { width: 10, height: 10, borderRadius: Radius.pill },
});
