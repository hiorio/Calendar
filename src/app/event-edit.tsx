import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/ui/card';
import { Content } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventDetailTools } from '@/features/events/event-detail-tools';
import { EventEditorHeader } from '@/features/events/event-editor-header';
import { EventForm, type EventFormHandle } from '@/features/events/event-form';
import { useEventEditorExit } from '@/features/events/use-event-editor-exit';
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
import { fromTimeColumns, occurrenceTime } from '@/lib/event-time';
import { parseRrule } from '@/lib/recurrence';

const SCOPE_OPTIONS = [
  { value: 'THIS' as const, label: '이 일정만' },
  { value: 'FOLLOWING' as const, label: '이후 모두' },
  { value: 'ALL' as const, label: '전체' },
];

export default function EventEditScreen() {
  const { colors } = useTheme();
  // occ = 이 화면이 열린 회차. 반복 일정에서 "이 일정만"의 대상이 된다.
  const { id, occ } = useLocalSearchParams<{ id: string; occ?: string }>();

  const calendars = useMyCalendars();
  const event = useEvent(id);
  const exception = useOccurrenceException(id, occ ?? null);
  const update = useUpdateEvent(id);
  const updateOccurrence = useUpdateOccurrence(id);
  const remove = useDeleteEvent(id);
  const formRef = useRef<EventFormHandle>(null);

  const [scope, setScope] = useState<EditScope>('THIS');
  const [dirty, setDirty] = useState(false);
  const pending = update.isPending || updateOccurrence.isPending || remove.isPending;
  const { finish, savingRef } = useEventEditorExit(pending, dirty);

  // 예외 조회가 끝나기 전에는 폼을 그리지 않는다.
  // EventForm 은 initial 을 useState 로 한 번만 받으므로, 나중에 도착한 값은
  // 반영되지 않는다 — 고쳐 둔 회차를 열었는데 마스터 값이 보이게 된다.
  const exceptionPending = Boolean(occ) && !exception.isFetched;

  if (!event.data || !calendars.data || exceptionPending) {
    return (
      <>
        <EventEditorHeader saveDisabled onSave={() => undefined} />
        <Content style={[styles.empty, { backgroundColor: colors.background }]}>
          <Txt variant="body" tone="secondary">
            {event.isError || exception.isError ? '일정을 불러오지 못했습니다.' : '불러오는 중…'}
          </Txt>
        </Content>
      </>
    );
  }

  const master = event.data;
  // MODIFIED 예외만 값을 덮는다. CANCELLED는 목록에서 이미 빠져 여기 오지 않는다.
  const isRecurring = Boolean(master.rrule);
  // 회차 정보가 없으면(예: 링크로 직접 들어옴) 회차 단위 작업을 할 수 없다
  const originalStart = occ ?? null;
  const canScope = isRecurring && originalStart !== null;
  const effectiveScope: EditScope = canScope ? scope : 'ALL';
  const patch = effectiveScope !== 'ALL' && exception.data?.type === 'MODIFIED' ? exception.data : null;

  // "이후 모두 수정"은 시리즈를 둘로 쪼개는 일이라 아직 없다. 삭제만 된다.
  const submitBlocked = effectiveScope === 'FOLLOWING';

  async function askDelete() {
    if (savingRef.current || pending) return;
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
    if (!ok || savingRef.current) return;

    savingRef.current = true;
    try { await remove.mutateAsync(
      {
        scope: effectiveScope,
        originalStart: originalStart ?? undefined,
        rrule: master.rrule,
        timezone: master.timezone,
      },
    ); finish(); } catch { /* mutation 오류를 아래에서 표시 */ }
    finally { savingRef.current = false; }
  }

  async function changeScope(next: EditScope) {
    if (pending || savingRef.current || next === scope) return;
    if (formRef.current?.isDirty() && !await confirm({ title: '적용 범위를 바꿀까요?', message: '지금 입력한 변경 내용은 버리고 선택한 범위의 원래 값을 불러옵니다.', confirmLabel: '범위 변경' })) return;
    if (savingRef.current) return;
    setDirty(false);
    setScope(next);
  }

  return (
    <>
      <EventEditorHeader
        pending={pending}
        saveDisabled={submitBlocked}
        onSave={() => formRef.current?.submit()}
      />
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Content style={styles.content}>
          <EventForm
            key={`${id}:${effectiveScope}`}
            ref={formRef}
            calendars={calendars.data}
            submitLabel="저장"
            showSubmitButton={false}
            pending={pending}
            submitDisabled={submitBlocked}
            onDirtyChange={setDirty}
            // 이 회차만 고치는 중이면 반복 규칙 자체는 만질 수 없다
            lockRecurrence={canScope && scope === 'THIS'}
            initial={{
              calendarId: master.calendar_id,
              // 이 회차만 고쳐 둔 값이 있으면 그것을 보여 준다
              title: patch?.title ?? master.title,
              location: patch?.location ?? master.location ?? '',
              description: patch?.description ?? master.description ?? '',
              time: fromTimeColumns(effectiveScope === 'ALL' ? master : occurrenceTime(master, occ, patch)),
              recurrence: parseRrule(master.rrule),
              rawRrule: master.rrule,
              timezone: master.timezone,
            }}
            onSubmit={async (input) => {
              if (savingRef.current || submitBlocked) return;
              savingRef.current = true;
              try {
                if (effectiveScope === 'THIS' && originalStart) await updateOccurrence.mutateAsync({ originalStart, input });
                else await update.mutateAsync(input);
                finish();
              } catch { /* mutation 오류를 아래에서 표시 */ }
              finally { savingRef.current = false; }
            }}
            onDelete={askDelete}
            deleteLabel={canScope ? '이 범위 삭제' : '일정 삭제'}>
            {canScope ? (
              <View>
                <Divider />
                <View style={styles.scopeSection}>
                  <Txt variant="label" tone="secondary">
                    적용 범위
                  </Txt>
                  <Segmented options={SCOPE_OPTIONS} value={scope} onChange={(next) => { void changeScope(next); }} />
                  {submitBlocked ? (
                    <Txt variant="caption" tone="secondary">
                      이후 모두 수정은 준비 중이며 삭제만 가능합니다.
                    </Txt>
                  ) : null}
                </View>
              </View>
            ) : null}
          </EventForm>

          {update.isError || updateOccurrence.isError || remove.isError ? (
            <Txt variant="caption" tone="danger">
              처리하지 못했습니다:{' '}
              {((update.error ?? updateOccurrence.error ?? remove.error) as Error).message}
            </Txt>
          ) : null}

          <EventDetailTools
            eventId={id}
            calendarId={master.calendar_id}
            isRecurring={isRecurring}
          />
        </Content>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  empty: { justifyContent: 'center', paddingHorizontal: Spacing.xl },
  scopeSection: { gap: Spacing.sm, padding: Spacing.lg },
});
