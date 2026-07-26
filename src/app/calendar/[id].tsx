import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { ListRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { CALENDAR_COLORS, onColor } from '@/features/calendars/colors';
import { buildInviteLink } from '@/features/calendars/invites';
import {
  useCalendarInvites,
  useCalendarMembers,
  useCreateInvite,
  useMyCalendars,
  useRemoveMember,
  useRevokeInvite,
  useTransferOwnership,
  useUpdateCalendar,
} from '@/features/calendars/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm, notify } from '@/lib/confirm';

export default function CalendarDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, isGuest } = useAuth();

  const calendars = useMyCalendars();
  const calendar = calendars.data?.find((c) => c.id === id);
  const members = useCalendarMembers(id);
  const invites = useCalendarInvites(id);

  const update = useUpdateCalendar(id);
  const createInvite = useCreateInvite(id);
  const revokeInvite = useRevokeInvite(id);
  const removeMember = useRemoveMember(id);
  const transfer = useTransferOwnership(id);

  const [name, setName] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  if (calendars.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!calendar) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          캘린더를 찾을 수 없습니다.
        </Txt>
      </View>
    );
  }

  const isOwner = calendar.role === 'OWNER';
  const currentName = name ?? calendar.name;
  const currentColor = color ?? calendar.color;
  const dirty = currentName.trim() !== calendar.name || currentColor !== calendar.color;

  async function saveEdits() {
    if (!currentName.trim()) return;
    try {
      await update.mutateAsync({ name: currentName.trim(), color: currentColor });
      setName(null);
      setColor(null);
    } catch (e) {
      notify('저장하지 못했습니다', e instanceof Error ? e.message : String(e));
    }
  }

  async function shareInvite(code: string) {
    const link = buildInviteLink(code);
    try {
      const result = await Share.share({ message: `${calendar!.name} 캘린더에 초대합니다\n${link}` });
      if (result.action === Share.dismissedAction) return;
    } catch {
      // 웹 등 공유 시트가 없는 환경 → 클립보드로 대체
      await Clipboard.setStringAsync(link);
      notify('초대 링크를 복사했습니다', link);
    }
  }

  async function copyInvite(code: string) {
    const link = buildInviteLink(code);
    await Clipboard.setStringAsync(link);
    notify('초대 링크를 복사했습니다', link);
  }

  async function handleLeave() {
    const ok = await confirm({
      title: `${calendar!.name}에서 나갈까요?`,
      message:
        '내가 만든 일정과 댓글은 남습니다. 다시 들어오려면 초대 링크가 필요합니다.',
      confirmLabel: '나가기',
      destructive: true,
    });
    if (!ok) return;

    try {
      await removeMember.mutateAsync(user!.id);
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notify(
        '나갈 수 없습니다',
        /소유자/.test(message)
          ? '소유자는 먼저 다른 구성원에게 소유권을 넘겨야 합니다.'
          : message,
      );
    }
  }

  async function handleKick(userId: string, nickname: string) {
    const ok = await confirm({
      title: `${nickname}님을 내보낼까요?`,
      message: '그동안 작성한 일정과 댓글은 남습니다.',
      confirmLabel: '내보내기',
      destructive: true,
    });
    if (!ok) return;

    try {
      await removeMember.mutateAsync(userId);
    } catch (e) {
      notify('내보내지 못했습니다', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTransfer(userId: string, nickname: string) {
    const ok = await confirm({
      title: `${nickname}님에게 소유권을 넘길까요?`,
      message: '넘기고 나면 내 역할은 일반 구성원이 됩니다.',
      confirmLabel: '넘기기',
    });
    if (!ok) return;

    try {
      await transfer.mutateAsync(userId);
    } catch (e) {
      notify('소유권을 넘기지 못했습니다', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <Section title="캘린더">
          <Card>
            <View style={styles.editor}>
              <Field
                label="이름"
                value={currentName}
                onChangeText={setName}
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={saveEdits}
              />

              <View style={styles.colorSection}>
                <Txt variant="label" tone="secondary">
                  색
                </Txt>
                <View style={styles.swatches}>
                  {CALENDAR_COLORS.map((option) => {
                    const selected = option === currentColor;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        accessibilityLabel={`색 ${option}`}
                        accessibilityState={{ selected }}
                        onPress={() => setColor(option)}
                        style={[
                          styles.swatch,
                          { backgroundColor: option },
                          selected && { borderColor: colors.text, borderWidth: 2 },
                        ]}>
                        {selected ? (
                          <Txt variant="caption" style={{ color: onColor(option) }}>
                            ✓
                          </Txt>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {dirty ? (
                <Button label="저장" loading={update.isPending} onPress={saveEdits} />
              ) : null}
            </View>
          </Card>
        </Section>

        <Section title={`구성원 ${members.data?.length ?? 0}명`}>
          <Card padded={false}>
            {members.isPending ? (
              <ActivityIndicator color={colors.accent} style={styles.rowLoading} />
            ) : (
              members.data?.map((member, index) => {
                const isMe = member.user_id === user?.id;
                return (
                  <View key={member.user_id}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={`${member.nickname}${isMe ? ' (나)' : ''}`}
                      subtitle={member.role === 'OWNER' ? '소유자' : '구성원'}
                      right={
                        isOwner && !isMe ? (
                          <View style={styles.memberActions}>
                            <IconAction
                              icon="key-outline"
                              label={`${member.nickname}에게 소유권 넘기기`}
                              onPress={() => handleTransfer(member.user_id, member.nickname)}
                            />
                            <IconAction
                              icon="person-remove-outline"
                              label={`${member.nickname} 내보내기`}
                              danger
                              onPress={() => handleKick(member.user_id, member.nickname)}
                            />
                          </View>
                        ) : undefined
                      }
                    />
                  </View>
                );
              })
            )}
          </Card>
        </Section>

        <Section title="초대">
          {isGuest ? (
            <>
              <Notice title="공유하려면 계정이 필요합니다">
                초대 링크는 계정이 있어야 만들 수 있습니다. 지금 쓰던 내용은 그대로 유지됩니다.
              </Notice>
              <Button
                label="계정 만들기"
                onPress={() =>
                  router.push({
                    pathname: '/account',
                    params: { reason: '초대 링크를 만들려면 계정이 필요합니다.' },
                  })
                }
              />
            </>
          ) : (
            <>
              <Card padded={false}>
                {invites.data?.length ? (
                  invites.data.map((invite, index) => (
                    <View key={invite.id}>
                      {index > 0 ? <Divider /> : null}
                      <ListRow
                        icon="link-outline"
                        title={invite.code}
                        subtitle={
                          invite.expires_at
                            ? `${new Date(invite.expires_at).toLocaleDateString('ko-KR')}까지 · ${invite.use_count}명 사용`
                            : `무기한 · ${invite.use_count}명 사용`
                        }
                        right={
                          <View style={styles.memberActions}>
                            <IconAction
                              icon="copy-outline"
                              label="링크 복사"
                              onPress={() => copyInvite(invite.code)}
                            />
                            <IconAction
                              icon="share-outline"
                              label="링크 공유"
                              onPress={() => shareInvite(invite.code)}
                            />
                            <IconAction
                              icon="close-circle-outline"
                              label="링크 취소"
                              danger
                              onPress={() => revokeInvite.mutate(invite.id)}
                            />
                          </View>
                        }
                      />
                    </View>
                  ))
                ) : (
                  <View style={styles.noInvites}>
                    <Txt variant="body" tone="secondary">
                      아직 만든 초대 링크가 없습니다.
                    </Txt>
                  </View>
                )}
              </Card>

              <Button
                label="초대 링크 만들기"
                variant="secondary"
                loading={createInvite.isPending}
                onPress={() =>
                  createInvite.mutate(undefined, {
                    onSuccess: (invite) => shareInvite(invite.code),
                    onError: (e) =>
                      notify('초대 링크를 만들지 못했습니다', e instanceof Error ? e.message : String(e)),
                  })
                }
              />
              <Txt variant="caption" tone="tertiary">
                링크는 7일 뒤 만료됩니다. 유출되면 언제든 취소할 수 있습니다.
              </Txt>
            </>
          )}
        </Section>

        <Section title="">
          <Card padded={false}>
            <ListRow
              icon="exit-outline"
              title="이 캘린더에서 나가기"
              danger
              onPress={handleLeave}
              disabled={removeMember.isPending}
            />
          </Card>
          {isOwner && (members.data?.length ?? 0) > 1 ? (
            <Txt variant="caption" tone="tertiary">
              소유자는 다른 구성원에게 소유권을 넘긴 뒤에 나갈 수 있습니다.
            </Txt>
          ) : null}
        </Section>
      </Content>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>
          {title}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        { backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
      ]}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingVertical: Spacing.xl },
  content: { flex: 0, gap: Spacing.xxl, paddingHorizontal: Spacing.xl },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  editor: { gap: Spacing.lg },
  colorSection: { gap: Spacing.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 2,
  },
  memberActions: { flexDirection: 'row', gap: Spacing.xs },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLoading: { paddingVertical: Spacing.xl },
  noInvites: { padding: Spacing.lg },
});
