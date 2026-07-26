import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventForm } from '@/features/events/event-form';
import {
  useDeleteEvent,
  useEvent,
  useUpdateEvent,
  useUpdateOccurrence,
  type EditScope,
} from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';
import { fromTimeColumns } from '@/lib/event-time';
import { parseRrule } from '@/lib/recurrence';

const SCOPE_OPTIONS = [
  { value: 'THIS' as const, label: '이 일정만' },
  { value: 'FOLLOWING' as const, label: '이후 모두' },
  { value: 'ALL' as const, label: '전체' },
];

export default function EventDetailScreen() {
  const { colors } = useTheme();
  // occ = 이 화면이 열린 회차. 반복 일정에서 "이 일정만"의 대상이 된다.
  const { id, occ } = useLocalSearchParams<{ id: string; occ?: string }>();

  const calendars = useMyCalendars();
  const event = useEvent(id);
  const update = useUpdateEvent(id);
  const updateOccurrence = useUpdateOccurrence(id);
  const remove = useDeleteEvent(id);

  const [scope, setScope] = useState<EditScope>('THIS');

  if (!event.data || !calendars.data) {
    return (
      <Content style={[styles.empty, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          {event.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
        </Txt>
      </Content>
    );
  }

  const master = event.data;
  const isRecurring = Boolean(master.rrule);
  // 회차 정보가 없으면(예: 링크로 직접 들어옴) 회차 단위 작업을 할 수 없다
  const originalStart = occ ?? null;
  const canScope = isRecurring && originalStart !== null;
  const effectiveScope: EditScope = canScope ? scope : 'ALL';

  // "이후 모두 수정"은 시리즈를 둘로 쪼개는 일이라 아직 없다. 삭제만 된다.
  const submitBlocked = effectiveScope === 'FOLLOWING';

  async function askDelete() {
    const message = {
      THIS: '이 날짜의 일정만 사라집니다. 나머지 회차는 그대로예요.',
      FOLLOWING: '이 날짜부터 뒤의 모든 회차가 사라집니다.',
      ALL: '함께 보는 사람들의 캘린더에서도 사라집니다.',
    }[effectiveScope];

    const ok = await confirm({
      title: '이 일정을 삭제할까요?',
      message,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    remove.mutate(
      {
        scope: effectiveScope,
        originalStart: originalStart ?? undefined,
        rrule: master.rrule,
        timezone: master.timezone,
      },
      { onSuccess: () => router.back() },
    );
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
            pending={update.isPending || updateOccurrence.isPending || remove.isPending}
            submitDisabled={submitBlocked}
            // 이 회차만 고치는 중이면 반복 규칙 자체는 만질 수 없다
            lockRecurrence={canScope && scope === 'THIS'}
            initial={{
              calendarId: master.calendar_id,
              title: master.title,
              location: master.location ?? '',
              description: master.description ?? '',
              // 회차로 들어왔으면 그 회차의 시각을 보여 준다
              time: fromTimeColumns(occurrenceTime(master, occ)),
              recurrence: parseRrule(master.rrule),
            }}
            onSubmit={(input) => {
              if (effectiveScope === 'THIS' && originalStart) {
                updateOccurrence.mutate(
                  { originalStart, input },
                  { onSuccess: () => router.back() },
                );
                return;
              }
              update.mutate(input, { onSuccess: () => router.back() });
            }}
            onDelete={askDelete}
            deleteLabel={canScope ? '이 범위 삭제' : '일정 삭제'}>
            {canScope ? (
              <View style={styles.scopeSection}>
                <Txt variant="label" tone="secondary">
                  적용 범위
                </Txt>
                <Segmented options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
                {submitBlocked ? (
                  <Notice tone="info" title="이후 모두 수정은 아직 없습니다">
                    시리즈를 둘로 나눠야 해서 다음에 붙입니다. 삭제는 지금도 됩니다.
                  </Notice>
                ) : null}
              </View>
            ) : null}
          </EventForm>

          {update.isError || updateOccurrence.isError || remove.isError ? (
            <Txt variant="caption" tone="danger">
              처리하지 못했습니다:{' '}
              {((update.error ?? updateOccurrence.error ?? remove.error) as Error).message}
            </Txt>
          ) : null}
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * 마스터의 시간 컬럼을 이 회차의 시각으로 갈아 끼운다.
 *
 * 반복 일정의 마스터는 첫 회차의 시각만 갖고 있다. 3월 회차를 열었는데 1월
 * 날짜가 보이면 안 된다.
 */
function occurrenceTime<T extends { is_all_day: boolean; start_at: string | null; end_at: string | null; start_date: string | null; end_date: string | null; timezone: string }>(
  master: T,
  occ: string | undefined,
): T {
  if (!occ) return master;

  const start = new Date(occ);
  if (Number.isNaN(start.getTime())) return master;

  if (master.is_all_day) {
    const days =
      (new Date(master.end_date!).getTime() - new Date(master.start_date!).getTime()) / 86_400_000;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const key = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    return { ...master, start_date: key(start), end_date: key(end) };
  }

  const span = new Date(master.end_at!).getTime() - new Date(master.start_at!).getTime();
  return {
    ...master,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + span).toISOString(),
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  empty: { justifyContent: 'center', paddingHorizontal: Spacing.xl },
  scopeSection: { gap: Spacing.sm },
});
