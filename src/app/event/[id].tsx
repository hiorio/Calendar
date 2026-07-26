import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventForm } from '@/features/events/event-form';
import { useDeleteEvent, useEvent, useUpdateEvent } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';
import { fromTimeColumns } from '@/lib/event-time';

export default function EventDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const calendars = useMyCalendars();
  const event = useEvent(id);
  const update = useUpdateEvent(id);
  const remove = useDeleteEvent(id);

  if (!event.data || !calendars.data) {
    return (
      <Content style={[styles.empty, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          {event.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
        </Txt>
      </Content>
    );
  }

  async function askDelete() {
    const ok = await confirm({
      title: '이 일정을 삭제할까요?',
      message: '함께 보는 사람들의 캘린더에서도 사라집니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    remove.mutate(undefined, { onSuccess: () => router.back() });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Content style={styles.content}>
          <EventForm
            calendars={calendars.data}
            submitLabel="저장"
            pending={update.isPending || remove.isPending}
            initial={{
              calendarId: event.data.calendar_id,
              title: event.data.title,
              location: event.data.location ?? '',
              description: event.data.description ?? '',
              time: fromTimeColumns(event.data),
            }}
            onSubmit={(input) => update.mutate(input, { onSuccess: () => router.back() })}
            onDelete={askDelete}
          />

          {update.isError || remove.isError ? (
            <Txt variant="caption" tone="danger">
              처리하지 못했습니다:{' '}
              {((update.error ?? remove.error) as Error).message}
            </Txt>
          ) : null}
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  empty: { justifyContent: 'center', paddingHorizontal: Spacing.xl },
});
