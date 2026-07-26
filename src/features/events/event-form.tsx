import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { DateTimeField } from '@/components/ui/date-time-field';
import { Field } from '@/components/ui/field';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { MyCalendar } from '@/features/calendars/queries';
import type { EventInput } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import {
  moveEnd,
  moveStart,
  switchAllDay,
  toTimeColumns,
  type EventTimeForm,
} from '@/lib/event-time';

export type EventFormValues = {
  calendarId: string;
  title: string;
  location: string;
  description: string;
  time: EventTimeForm;
};

export type EventFormProps = {
  calendars: MyCalendar[];
  initial: EventFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (input: EventInput) => void;
  /** 수정 화면에서만 준다 */
  onDelete?: () => void;
};

export function EventForm({
  calendars,
  initial,
  submitLabel,
  pending = false,
  onSubmit,
  onDelete,
}: EventFormProps) {
  const { colors } = useTheme();

  const [calendarId, setCalendarId] = useState(initial.calendarId);
  const [title, setTitle] = useState(initial.title);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [time, setTime] = useState<EventTimeForm>(initial.time);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!title.trim()) {
      setError('일정 이름을 입력해 주세요');
      return;
    }
    if (!calendarId) {
      setError('어느 캘린더에 넣을지 골라 주세요');
      return;
    }
    setError(null);

    onSubmit({
      calendar_id: calendarId,
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      ...toTimeColumns(time),
    });
  }

  return (
    <View style={styles.form}>
      <Field
        label="일정"
        value={title}
        onChangeText={setTitle}
        placeholder="무엇을 하나요?"
        maxLength={100}
        autoFocus={!initial.title}
        returnKeyType="next"
      />

      {/* 캘린더가 하나뿐이면 고를 것이 없다 */}
      {calendars.length > 1 ? (
        <View style={styles.section}>
          <Txt variant="label" tone="secondary">
            캘린더
          </Txt>
          <View style={styles.calendarPicker}>
            {calendars.map((calendar) => {
              const selected = calendar.id === calendarId;
              return (
                <Pressable
                  key={calendar.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={calendar.name}
                  onPress={() => setCalendarId(calendar.id)}
                  style={[
                    styles.calendarChip,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}>
                  <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                  <Txt variant="label" tone={selected ? 'accent' : 'secondary'}>
                    {calendar.name}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Card flat style={styles.timeCard}>
        <View style={styles.allDayRow}>
          <Txt variant="body">종일</Txt>
          <Switch
            value={time.isAllDay}
            onValueChange={(next) => setTime((current) => switchAllDay(current, next))}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
          />
        </View>

        <Divider />

        <View style={styles.timeRows}>
          <DateTimeField
            label="시작"
            mode="date"
            value={time.start}
            onChange={(next) => setTime((current) => moveStart(current, next))}
          />
          {!time.isAllDay ? (
            <DateTimeField
              label="시작 시각"
              mode="time"
              value={time.start}
              onChange={(next) => setTime((current) => moveStart(current, next))}
            />
          ) : null}

          <DateTimeField
            label="종료"
            mode="date"
            value={time.end}
            onChange={(next) => setTime((current) => moveEnd(current, next))}
          />
          {!time.isAllDay ? (
            <DateTimeField
              label="종료 시각"
              mode="time"
              value={time.end}
              onChange={(next) => setTime((current) => moveEnd(current, next))}
            />
          ) : null}
        </View>
      </Card>

      <Field
        label="장소"
        value={location}
        onChangeText={setLocation}
        placeholder="어디에서 (선택)"
        maxLength={200}
      />

      <Field
        label="메모"
        value={description}
        onChangeText={setDescription}
        placeholder="남겨 둘 내용 (선택)"
        multiline
        style={styles.memo}
      />

      {error ? (
        <Txt variant="caption" tone="danger">
          {error}
        </Txt>
      ) : null}

      <Button label={submitLabel} loading={pending} onPress={submit} />

      {onDelete ? (
        <Button label="일정 삭제" variant="danger" onPress={onDelete} disabled={pending} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.xl },
  section: { gap: Spacing.sm },
  calendarPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  calendarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 34,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  timeCard: { paddingVertical: Spacing.xs },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  timeRows: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.xs },
  memo: { height: 96, paddingTop: Spacing.md, textAlignVertical: 'top' },
});
