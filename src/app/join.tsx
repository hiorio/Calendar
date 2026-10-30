import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { calendarColorForScheme, onColor } from '@/features/calendars/colors';
import { useAcceptInvite, useInvitePreview } from '@/features/calendars/invites';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/lib/confirm';

const REASON_TEXT: Record<string, string> = {
  NOT_FOUND: '초대 링크를 찾을 수 없습니다. 링크가 정확한지 확인해 주세요.',
  REVOKED: '취소된 초대 링크입니다. 보낸 사람에게 새 링크를 요청하세요.',
  EXPIRED: '만료된 초대 링크입니다. 보낸 사람에게 새 링크를 요청하세요.',
  EXHAUSTED: '사용 횟수를 모두 채운 초대 링크입니다.',
};

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { colors, scheme } = useTheme();
  const { isGuest } = useAuth();

  const preview = useInvitePreview(code);
  const accept = useAcceptInvite();

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  if (!code) {
    return (
      <Wrapper>
        <EmptyState icon="link-outline" title="초대 코드가 없습니다" />
        <Button label="닫기" variant="secondary" onPress={close} />
      </Wrapper>
    );
  }

  if (preview.isPending) {
    return (
      <Wrapper>
        <ActivityIndicator color={colors.accent} />
      </Wrapper>
    );
  }

  if (preview.isError || !preview.data?.valid) {
    return (
      <Wrapper>
        <EmptyState
          icon="alert-circle-outline"
          title="이 링크로는 들어갈 수 없어요"
          description={
            preview.data?.reason
              ? REASON_TEXT[preview.data.reason]
              : '초대 정보를 불러오지 못했습니다.'
          }
        />
        <Button label="닫기" variant="secondary" onPress={close} />
      </Wrapper>
    );
  }

  const invite = preview.data;

  if (invite.already_member) {
    return (
      <Wrapper>
        <EmptyState
          icon="checkmark-circle-outline"
          title="이미 참여 중입니다"
          description={`${invite.calendar_name} 캘린더에 이미 들어가 있어요.`}
        />
        <Button label="캘린더로 가기" onPress={() => router.replace('/')} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Card style={styles.inviteCard}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: calendarColorForScheme(
                invite.calendar_color ?? colors.accent,
                scheme,
              ),
            },
          ]}>
          <Txt
            variant="title"
            style={{
              color: invite.calendar_color
                ? onColor(invite.calendar_color, scheme)
                : colors.onAccent,
            }}>
            {invite.calendar_name?.slice(0, 1) ?? '·'}
          </Txt>
        </View>

        <View style={styles.inviteText}>
          <Txt variant="title">{invite.calendar_name}</Txt>
          <Txt variant="body" tone="secondary">
            {invite.inviter ? `${invite.inviter}님이 초대했습니다` : '캘린더에 초대되었습니다'}
          </Txt>
          <Txt variant="caption" tone="tertiary">
            구성원 {invite.member_count}명
          </Txt>
        </View>
      </Card>

      {isGuest ? (
        <>
          <Notice title="참여하려면 계정이 필요합니다">
            공유 캘린더는 기기를 바꿔도 이어져야 해서 계정이 필요합니다. 지금까지 쓰던 내용은 그대로
            유지됩니다.
          </Notice>
          <Button
            label="계정 만들고 참여하기"
            onPress={() =>
              router.push({
                pathname: '/account',
                params: { reason: `${invite.calendar_name} 캘린더에 참여하려면 계정이 필요합니다.` },
              })
            }
          />
        </>
      ) : (
        <Button
          label="참여하기"
          loading={accept.isPending}
          onPress={() =>
            accept.mutate(code, {
              onSuccess: () => router.replace('/'),
              onError: (e) =>
                notify('참여하지 못했습니다', e instanceof Error ? e.message : String(e)),
            })
          }
        />
      )}

      <Button label="나중에" variant="ghost" onPress={close} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>{children}</Content>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  inviteCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { flex: 1, gap: 2 },
});
