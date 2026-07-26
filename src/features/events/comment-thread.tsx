import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Notice } from '@/components/ui/notice';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import {
  formatRelativeTime,
  useAddComment,
  useComments,
  useDeleteComment,
} from '@/features/events/comments';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';

export type CommentThreadProps = {
  eventId: string;
  /** 반복 일정이면 댓글이 모든 회차에 함께 보인다는 것을 알린다 */
  isRecurring?: boolean;
};

export function CommentThread({ eventId, isRecurring = false }: CommentThreadProps) {
  const { colors } = useTheme();
  const comments = useComments(eventId);
  const add = useAddComment(eventId);
  const remove = useDeleteComment(eventId);

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  function send() {
    const content = draft.trim();
    if (!content) return;

    add.mutate(content, { onSuccess: () => setDraft('') });
  }

  async function askDelete(commentId: string) {
    const ok = await confirm({
      title: '댓글을 삭제할까요?',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (ok) remove.mutate(commentId);
  }

  return (
    <View style={styles.section}>
      <Txt variant="label" tone="secondary">
        댓글
      </Txt>

      {isRecurring ? (
        <Notice tone="info" title="반복 일정의 댓글은 모든 회차가 함께 봅니다">
          이 날짜에만 남는 것이 아닙니다.
        </Notice>
      ) : null}

      {comments.data && comments.data.length > 0 ? (
        <View style={styles.list}>
          {comments.data.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]}>
                <Txt variant="caption" tone="secondary">
                  {comment.nickname.slice(0, 1)}
                </Txt>
              </View>

              <View style={styles.body}>
                <View style={styles.meta}>
                  <Txt variant="label">{comment.nickname}</Txt>
                  <Txt variant="caption" tone="tertiary">
                    {formatRelativeTime(comment.created_at)}
                  </Txt>
                </View>
                <Txt variant="body">{comment.content}</Txt>
              </View>

              {comment.mine ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="내 댓글 삭제"
                  onPress={() => askDelete(comment.id)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && { backgroundColor: colors.surfacePressed },
                  ]}>
                  <Ionicons name="close" size={14} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="caption" tone="tertiary">
          {comments.isLoading ? '불러오는 중…' : '아직 댓글이 없습니다.'}
        </Txt>
      )}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="댓글 남기기"
          placeholderTextColor={colors.textTertiary}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: focused ? colors.accent : colors.border,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="댓글 보내기"
          disabled={!draft.trim() || add.isPending}
          onPress={send}
          style={({ pressed }) => [
            styles.send,
            {
              backgroundColor: pressed ? colors.accentPressed : colors.accent,
              opacity: !draft.trim() || add.isPending ? 0.4 : 1,
            },
          ]}>
          <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
        </Pressable>
      </View>

      {add.isError || remove.isError ? (
        <Txt variant="caption" tone="danger">
          {((add.error ?? remove.error) as Error).message}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  list: { gap: Spacing.lg, paddingVertical: Spacing.xs },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: {
    ...Typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
