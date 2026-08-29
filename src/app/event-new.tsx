import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyCalendars } from '@/features/calendars/queries';
import {
  uploadAttachmentDrafts,
  type AttachmentDraft,
} from '@/features/events/attachment-queries';
import { AttachmentDraftPicker } from '@/features/events/attachments';
import { EventEditorHeader } from '@/features/events/event-editor-header';
import { EventForm, type EventFormHandle } from '@/features/events/event-form';
import { useCreateEvent, type EventInput } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/lib/confirm';
import { newEventTime, parseDateKey } from '@/lib/event-time';

export default function NewEventScreen() {
  const { colors } = useTheme();
  const {
    date,
    calendarId,
    copyTitle,
    copyLocation,
    copyDescription,
    copyAllDay,
    copyStartAt,
    copyEndAt,
    copyStartDate,
    copyEndDate,
    multiCopy,
  } = useLocalSearchParams<{
    date?: string;
    calendarId?: string;
    copyTitle?: string;
    copyLocation?: string;
    copyDescription?: string;
    copyAllDay?: string;
    copyStartAt?: string;
    copyEndAt?: string;
    copyStartDate?: string;
    copyEndDate?: string;
    multiCopy?: string;
  }>();
  const { user } = useAuth();

  const calendars = useMyCalendars();
  const create = useCreateEvent();
  const formRef = useRef<EventFormHandle>(null);
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialTime] = useState(() => {
    const now = new Date();
    return newEventTime(date ? parseDateKey(date) : now, now);
  });

  async function submit(input: EventInput) {
    setSaving(true);
    try {
      const created = await create.mutateAsync(input);

      if (drafts.length && user) {
        try {
          await uploadAttachmentDrafts({
            drafts,
            eventId: created.id,
            calendarId: input.calendar_id,
            uploadedBy: user.id,
          });
        } catch (e) {
          notify(
            '일정은 저장됐지만 첨부하지 못했습니다',
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (multiCopy === 'true') {
        notify('일정을 복사했습니다', '날짜를 바꾼 뒤 다시 저장하면 계속 복사할 수 있습니다.');
      } else {
        router.back();
      }
    } catch {
      // mutation 상태의 오류 문구를 폼 아래에서 보여 준다.
    } finally {
      setSaving(false);
    }
  }

  // 캘린더가 없으면 넣을 곳이 없다. 만들기부터 안내한다.
  if (calendars.data && calendars.data.length === 0) {
    return (
      <Content style={[styles.empty, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="calendar-outline"
          title="먼저 캘린더가 필요해요"
          description="일정은 캘린더 안에 들어갑니다. 하나 만들고 다시 시도해 주세요."
          action={
            <Button
              label="캘린더 만들기"
              block={false}
              onPress={() => router.replace('/calendar-new')}
            />
          }
        />
      </Content>
    );
  }

  if (!calendars.data) {
    return (
      <Content style={[styles.empty, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          {calendars.isError ? '캘린더를 불러오지 못했습니다.' : '불러오는 중…'}
        </Txt>
      </Content>
    );
  }

  const copiedTime =
    copyAllDay === 'true' && copyStartDate
      ? {
          isAllDay: true,
          start: parseDateKey(copyStartDate),
          end: parseDateKey(copyEndDate || copyStartDate),
        }
      : copyAllDay === 'false' && copyStartAt && copyEndAt
        ? {
            isAllDay: false,
            start: new Date(copyStartAt),
            end: new Date(copyEndAt),
          }
        : initialTime;

  return (
    <>
      <EventEditorHeader
        pending={create.isPending || saving}
        onSave={() => formRef.current?.submit()}
      />
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Content style={styles.content}>
          {multiCopy === 'true' ? (
            <View style={[styles.copyGuide, { backgroundColor: colors.accentSoft }]}>
              <Txt variant="label" tone="accent">
                여러 날짜에 복사
              </Txt>
              <Txt variant="caption" tone="secondary">
                저장한 뒤 날짜를 바꾸고 다시 저장하세요. 완료하면 왼쪽 위 닫기를 누르세요.
              </Txt>
            </View>
          ) : null}
          <EventForm
            ref={formRef}
            calendars={calendars.data}
            submitLabel="추가"
            showSubmitButton={false}
            pending={create.isPending || saving}
            initial={{
              calendarId: calendarId ?? calendars.data[0].id,
              title: copyTitle ?? '',
              location: copyLocation ?? '',
              description: copyDescription ?? '',
              time: copiedTime,
              recurrence: { freq: null, until: null },
            }}
            onSubmit={submit}>
            <View>
              <Divider />
              <AttachmentDraftPicker
                compact
                drafts={drafts}
                onChange={setDrafts}
                disabled={saving}
              />
            </View>
          </EventForm>

          {create.isError ? (
            <Txt variant="caption" tone="danger">
              저장하지 못했습니다: {(create.error as Error).message}
            </Txt>
          ) : null}
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
  copyGuide: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
});
