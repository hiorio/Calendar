import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyCalendars, useSetMuted } from '@/features/calendars/queries';
import {
  countRegisteredDevices,
  registerForPush,
  type PushStatus,
} from '@/features/notifications/push';
import { useTheme } from '@/hooks/use-theme';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const calendars = useMyCalendars();
  const setMuted = useSetMuted();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<PushStatus | null>(null);
  const [checking, setChecking] = useState(false);

  // 화면을 닫았다 열어도 상태가 남도록 서버에서 읽는다.
  // 로컬 state 만 쓰면 매번 "등록 안 됨"으로 보인다.
  const devices = useQuery({
    queryKey: ['device-tokens', user?.id],
    enabled: Boolean(user),
    queryFn: () => countRegisteredDevices(user!.id),
  });

  async function enable() {
    if (!user) return;
    setChecking(true);
    try {
      setStatus(await registerForPush(user.id));
      await queryClient.invalidateQueries({ queryKey: ['device-tokens', user.id] });
    } finally {
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

        {/* 발송 워커가 붙기 전까지는 여기서 켜도 실제로 울리지 않는다.
            받는다고 해 놓고 안 오는 것보다 미리 말해 두는 편이 낫다. */}
        <Notice tone="info" title="아직 실제로 발송되지는 않습니다">
          누가 무엇을 바꿨는지는 이미 서버에 쌓이고 있습니다. 보내 주는 부분이 붙으면
          여기 설정 그대로 동작합니다.
        </Notice>

        <View style={styles.section}>
          <Txt variant="label" tone="secondary">
            이 기기
          </Txt>

          <Card>
            {status === null ? (
              <View style={styles.deviceBlock}>
                <Txt variant="body" tone="secondary">
                  {devices.data
                    ? `알림을 받도록 등록된 기기 ${devices.data}대입니다. 이 기기도 켜려면 아래를 눌러 주세요.`
                    : '아직 알림을 켠 기기가 없습니다.'}
                </Txt>
                <Button label="알림 켜기" loading={checking} onPress={enable} />
              </View>
            ) : (
              <View style={styles.deviceBlock}>
                <StatusLine status={status} />
                {status.state !== 'registered' ? (
                  <Button label="다시 시도" variant="secondary" loading={checking} onPress={enable} />
                ) : null}
              </View>
            )}
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
                        <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                        <Switch
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

function StatusLine({ status }: { status: PushStatus }) {
  switch (status.state) {
    case 'registered':
      return (
        <Notice tone="info" title="이 기기로 알림을 받습니다">
          {status.token}
        </Notice>
      );
    case 'denied':
      return (
        <Notice tone="danger" title="알림 권한이 거부되어 있습니다">
          기기 설정에서 이 앱의 알림을 허용해 주세요.
        </Notice>
      );
    default:
      return (
        <Notice tone="info" title="아직 이 환경에서는 받을 수 없습니다">
          {status.reason}
        </Notice>
      );
  }
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
