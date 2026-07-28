import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventAttachments } from '@/features/events/attachments';
import { CommentThread } from '@/features/events/comment-thread';
import { EventForm } from '@/features/events/event-form';
import { ParticipantPicker } from '@/features/events/participant-picker';
import { ReminderPicker } from '@/features/events/reminder-picker';
import {
  useDeleteEvent,
  useEvent,
  useOccurrenceException,
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
  const exception = useOccurrenceException(id, occ ?? null);
  const update = useUpdateEvent(id);
  const updateOccurrence = useUpdateOccurrence(id);
  const remove = useDeleteEvent(id);

  const [scope, setScope] = useState<EditScope>('THIS');

  // 예외 조회가 끝나기 전에는 폼을 그리지 않는다.
  // EventForm 은 initial 을 useState 로 한 번만 받으므로, 나중에 도착한 값은
  // 반영되지 않는다 — 고쳐 둔 회차를 열었는데 마스터 값이 보이게 된다.
  const exceptionPending = Boolean(occ) && !exception.isFetched;

  if (!event.data || !calendars.data || exceptionPending) {
    return (
      <Content style={[styles.empty, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          {event.isError || exception.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
        </Txt>
      </Content>
    );
  }

  const master = event.data;
  // MODIFIED 예외만 값을 덮는다. CANCELLED는 목록에서 이미 빠져 여기 오지 않는다.
  const patch = exception.data?.type === 'MODIFIED' ? exception.data : null;
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
              // 이 회차만 고쳐 둔 값이 있으면 그것을 보여 준다
              title: patch?.title ?? master.title,
              location: patch?.location ?? master.location ?? '',
              description: patch?.description ?? master.description ?? '',
              time: fromTimeColumns(occurrenceTime(master, occ, patch)),
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

          {/* 참여자와 댓글은 저장 버튼과 무관하게 바로 반영된다.
              폼과 섞이지 않도록 아래에 따로 둔다. */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <EventAttachments eventId={id} calendarId={master.calendar_id} />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <ParticipantPicker eventId={id} calendarId={master.calendar_id} />

          <ReminderPicker eventId={id} />

          <CommentThread eventId={id} isRecurring={isRecurring} />
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type TimeShape = {
  is_all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
};

/**
 * 마스터의 시간 컬럼을 이 회차의 시각으로 갈아 끼운다.
 *
 * 반복 일정의 마스터는 첫 회차의 시각만 갖고 있다. 3월 회차를 열었는데 1월
 * 날짜가 보이면 안 된다.
 *
 * 이 회차만 시간을 고쳐 둔 예외가 있으면 계산하지 않고 그 값을 그대로 쓴다.
 */
function occurrenceTime<T extends TimeShape>(
  master: T,
  occ: string | undefined,
  // 예외의 컬럼은 "안 정함"을 NULL로 표현한다
  patch?: { [K in keyof TimeShape]?: TimeShape[K] | null } | null,
): T {
  if (patch) {
    const allDay = patch.is_all_day ?? master.is_all_day;
    // 종일이면 date 쪽만, 시간 지정이면 at 쪽만 채운다. 섞으면 폼이 어긋난다.
    if (allDay && patch.start_date) {
      return { ...master, is_all_day: true, start_at: null, end_at: null,
        start_date: patch.start_date, end_date: patch.end_date ?? patch.start_date };
    }
    if (!allDay && patch.start_at) {
      return { ...master, is_all_day: false, start_date: null, end_date: null,
        start_at: patch.start_at, end_at: patch.end_at ?? patch.start_at };
    }
  }

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
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
});
