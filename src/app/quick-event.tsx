import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { useCreateEvent } from '@/features/events/queries';
import { QuickCalendarPicker } from '@/features/widgets/quick-calendar-picker';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDate,
  formatTime,
  parseDateKey,
  quickEventTime,
  startOfDay,
  toTimeColumns,
} from '@/lib/event-time';

type QuickTimeMode = 'timed' | 'all-day';

export default function QuickEventScreen() {
  const { colors } = useTheme();
  const { date, calendarId } = useLocalSearchParams<{ date?: string; calendarId?: string }>();
  const calendars = useMyCalendars();
  const create = useCreateEvent();
  const [title, setTitle] = useState('');
  const [chosenCalendarId, setChosenCalendarId] = useState(calendarId ?? '');
  const [timeMode, setTimeMode] = useState<QuickTimeMode>('timed');

  const baseDate = useMemo(() => (date ? parseDateKey(date) : new Date()), [date]);
  const timed = useMemo(() => quickEventTime(baseDate), [baseDate]);

  const selectedCalendarId = calendars.data?.some((calendar) => calendar.id === chosenCalendarId)
    ? chosenCalendarId
    : calendars.data?.length === 1
      ? calendars.data[0].id
      : '';

  async function submit() {
    if (!title.trim() || !selectedCalendarId) return;

    const allDay = startOfDay(baseDate);
    try {
      await create.mutateAsync({
        calendar_id: selectedCalendarId,
        title: title.trim(),
        description: null,
        location: null,
        rrule: null,
        ...toTimeColumns(
          timeMode === 'all-day'
            ? { isAllDay: true, start: allDay, end: allDay }
            : timed,
        ),
      });
      router.back();
    } catch {
      // mutation 상태의 오류 문구를 화면 안에 유지한다.
    }
  }

  if (!calendars.data) {
    return (
      <Content style={[styles.center, { backgroundColor: colors.background }]}>
        <Txt variant="body" tone="secondary">
          {calendars.isError ? '캘린더를 불러오지 못했습니다.' : '불러오는 중…'}
        </Txt>
      </Content>
    );
  }

  if (calendars.data.length === 0) {
    return (
      <Content style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="calendar-outline"
          title="먼저 캘린더가 필요해요"
          description="일정은 캘린더 안에 들어갑니다."
          action={<Button label="캘린더 만들기" onPress={() => router.replace('/calendar-new')} />}
        />
      </Content>
    );
  }

  const selectedCalendar = calendars.data.find((calendar) => calendar.id === selectedCalendarId);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <Content style={styles.content}>
          <View style={styles.intro}>
            <Txt variant="display">빠른 일정</Txt>
            <Txt variant="body" tone="secondary">
              제목과 저장 위치만 확인하면 바로 추가됩니다.
            </Txt>
          </View>

          <Card style={styles.form}>
            <Field
              autoFocus
              label="일정 제목"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={() => void submit()}
              placeholder={selectedCalendar ? `${selectedCalendar.name}에 일정 추가` : '일정 제목'}
              returnKeyType="done"
              maxLength={120}
            />

            <QuickCalendarPicker
              calendars={calendars.data}
              selectedId={selectedCalendarId}
              onChange={setChosenCalendarId}
            />

            <View style={styles.time}>
              <Segmented<QuickTimeMode>
                options={[
                  { value: 'timed', label: '시간 지정' },
                  { value: 'all-day', label: '종일' },
                ]}
                value={timeMode}
                onChange={setTimeMode}
              />
              <Txt variant="bodyStrong">
                {timeMode === 'all-day'
                  ? `${formatDate(baseDate)} · 종일`
                  : `${formatDate(timed.start)} · ${formatTime(timed.start)}~${formatTime(timed.end)}`}
              </Txt>
            </View>

            {!selectedCalendarId ? (
              <Txt variant="caption" tone="danger">
                개인 내용이 공유되는 실수를 막기 위해 저장할 캘린더를 먼저 골라 주세요.
              </Txt>
            ) : null}

            {create.isError ? (
              <Txt variant="caption" tone="danger">
                저장하지 못했습니다: {(create.error as Error).message}
              </Txt>
            ) : null}

            <Button
              label="일정 추가"
              loading={create.isPending}
              disabled={!title.trim() || !selectedCalendarId}
              onPress={() => void submit()}
            />
            <Button
              label="장소·반복 등 자세히 입력"
              variant="ghost"
              disabled={create.isPending}
              onPress={() =>
                router.replace({
                  pathname: '/event-new',
                  params: {
                    date: date ?? undefined,
                    calendarId: selectedCalendarId || undefined,
                    copyTitle: title || undefined,
                  },
                })
              }
            />
          </Card>
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  form: { gap: Spacing.lg },
  time: { gap: Spacing.md },
  center: { justifyContent: 'center', paddingHorizontal: Spacing.xl },
});
