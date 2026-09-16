import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useMyCalendars } from '@/features/calendars/queries';
import {
  useCreateMemo,
  useDeleteMemo,
  useMemos,
  useToggleMemo,
  type MemoWithCalendar,
} from '@/features/memos/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm, notify } from '@/lib/confirm';

export default function MemosScreen() {
  const { colors, scheme } = useTheme();
  const calendars = useMyCalendars();
  const memos = useMemos();
  const createMemo = useCreateMemo();
  const toggleMemo = useToggleMemo();
  const deleteMemo = useDeleteMemo();
  const [calendarId, setCalendarId] = useState('');
  const [content, setContent] = useState('');
  const submitting = useRef(false);
  const pendingIds = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const selectedCalendarId = calendarId || calendars.data?.[0]?.id || '';

  async function submit() {
    if (submitting.current || !selectedCalendarId || !content.trim()) return;
    submitting.current = true;
    try {
      await createMemo.mutateAsync({ calendarId: selectedCalendarId, content });
      setContent('');
    } catch (error) {
      notify('메모 저장 실패', error instanceof Error ? error.message : String(error));
    } finally {
      submitting.current = false;
    }
  }

  async function changeMemo(memo: MemoWithCalendar, remove: boolean) {
    if (pendingIds.current.has(memo.id)) return;
    pendingIds.current.add(memo.id);
    setBusyIds(new Set(pendingIds.current));
    setActionErrors((previous) => ({ ...previous, [memo.id]: '' }));
    try {
      if (remove) {
        if (!(await confirm({ title: '메모를 삭제할까요?', message: memo.content, confirmLabel: '삭제', destructive: true }))) return;
        await deleteMemo.mutateAsync(memo.id);
      } else {
        await toggleMemo.mutateAsync({ id: memo.id, done: !memo.done });
      }
    } catch (error) {
      setActionErrors((previous) => ({ ...previous, [memo.id]: error instanceof Error ? error.message : String(error) }));
    } finally {
      pendingIds.current.delete(memo.id);
      setBusyIds(new Set(pendingIds.current));
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">메모</Txt>
          <Txt variant="body" tone="secondary">
            함께 기억할 할 일과 짧은 기록을 캘린더별로 남깁니다.
          </Txt>
        </View>

        {(calendars.data?.length ?? 0) > 0 ? (
          <Card style={styles.composer}>
            <View style={styles.calendarPicker}>
              {calendars.data!.map((calendar) => {
                const selected = calendar.id === selectedCalendarId;
                return (
                  <Pressable
                    key={calendar.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setCalendarId(calendar.id)}
                    style={[
                      styles.calendarChip,
                      {
                        backgroundColor: selected ? colors.accentSoft : colors.surface,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                      ]}
                    />
                    <Txt variant="label" tone={selected ? 'accent' : 'secondary'}>
                      {calendar.name}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Field
              label="새 메모"
              value={content}
              onChangeText={setContent}
              placeholder="함께 기억할 내용을 입력하세요"
              maxLength={500}
              multiline
              style={styles.input}
            />
            <Button
              label="메모 추가"
              size="md"
              loading={createMemo.isPending}
              disabled={!content.trim()}
              onPress={submit}
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="먼저 캘린더를 만들어 주세요"
              description="메모는 함께 볼 캘린더에 저장됩니다."
            />
          </Card>
        )}

        <View style={styles.section}>
          <Txt variant="label" tone="tertiary">
            저장한 메모
          </Txt>
          <Card padded={false}>
            {memos.data?.length ? (
              memos.data.map((memo, index) => (
                <View key={memo.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.memoRow}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: memo.done, disabled: busyIds.has(memo.id), busy: busyIds.has(memo.id) }}
                      accessibilityLabel={`${memo.content} 완료 표시`}
                      disabled={busyIds.has(memo.id)}
                      onPress={() => void changeMemo(memo, false)}
                      style={styles.check}>
                      <Ionicons
                        name={memo.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={memo.done ? colors.accent : colors.textTertiary}
                      />
                    </Pressable>
                    <View style={styles.memoText}>
                      <Txt
                        variant="body"
                        tone={memo.done ? 'tertiary' : 'default'}
                        style={memo.done ? styles.done : undefined}>
                        {memo.content}
                      </Txt>
                      <View style={styles.meta}>
                        {busyIds.has(memo.id) ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                        <View
                          style={[
                            styles.dot,
                            {
                              backgroundColor: calendarColorForScheme(
                                memo.calendarColor,
                                scheme,
                              ),
                            },
                          ]}
                        />
                        <Txt variant="micro" tone="tertiary">
                          {memo.calendarName}
                        </Txt>
                      </View>
                      {actionErrors[memo.id] ? (
                        <Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">
                          {actionErrors[memo.id]} 같은 버튼을 눌러 다시 시도할 수 있습니다.
                        </Txt>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${memo.content} 삭제`}
                      disabled={busyIds.has(memo.id)}
                      accessibilityState={{ disabled: busyIds.has(memo.id) }}
                      onPress={() => void changeMemo(memo, true)}
                      style={styles.deleteButton}>
                      <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <EmptyState
                compact
                icon="document-text-outline"
                title="아직 메모가 없어요"
                description="위에서 첫 메모를 남겨 보세요."
              />
            )}
          </Card>
        </View>

        {memos.isError ? (
          <Txt variant="caption" tone="danger">
            메모를 불러오지 못했습니다: {(memos.error as Error).message}
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
  composer: { gap: Spacing.lg },
  section: { gap: Spacing.sm },
  calendarPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  calendarChip: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  input: { height: 86, paddingTop: Spacing.md, textAlignVertical: 'top' },
  memoRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  check: { padding: Spacing.xs },
  memoText: { flex: 1, gap: Spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  done: { textDecorationLine: 'line-through' },
  deleteButton: { padding: Spacing.sm },
});
