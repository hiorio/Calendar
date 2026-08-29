import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/card';
import { DateTimeField } from '@/components/ui/date-time-field';
import { usePreferredTextStyle } from '@/components/ui/preferred-text-style';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
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
import { FREQ_LABELS, buildRrule, type Freq, type RecurrenceForm } from '@/lib/recurrence';

export type EventFormValues = {
  calendarId: string;
  title: string;
  location: string;
  description: string;
  time: EventTimeForm;
  recurrence: RecurrenceForm;
};

export type EventFormProps = {
  calendars: MyCalendar[];
  initial: EventFormValues;
  submitLabel: string;
  pending?: boolean;
  /** 반복 입력을 숨긴다. 회차 하나만 고치는 중이면 규칙을 만질 수 없다. */
  lockRecurrence?: boolean;
  onSubmit: (input: EventInput) => void;
  /** 저장 버튼 위에 끼워 넣을 것 (수정 범위 선택 등) */
  children?: React.ReactNode;
  submitDisabled?: boolean;
  /** 수정 화면에서만 준다 */
  onDelete?: () => void;
  deleteLabel?: string;
  /** 네이티브 모달 헤더에 저장 버튼이 있을 때 본문 버튼을 숨긴다. */
  showSubmitButton?: boolean;
};

export type EventFormHandle = {
  submit: () => void;
};

const FREQ_OPTIONS: (Freq | null)[] = [null, 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export const EventForm = forwardRef<EventFormHandle, EventFormProps>(function EventForm(
  {
    calendars,
    initial,
    submitLabel,
    pending = false,
    lockRecurrence = false,
    onSubmit,
    children,
    submitDisabled = false,
    onDelete,
    deleteLabel = '일정 삭제',
    showSubmitButton = true,
  },
  ref,
) {
  const { colors, scheme } = useTheme();
  const titleTextStyle = usePreferredTextStyle(Typography.title);

  const [calendarId, setCalendarId] = useState(initial.calendarId);
  const [title, setTitle] = useState(initial.title);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [time, setTime] = useState<EventTimeForm>(initial.time);
  const [recurrence, setRecurrence] = useState<RecurrenceForm>(initial.recurrence);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(() => {
    if (!title.trim()) {
      setError('일정 이름을 입력해 주세요');
      return;
    }
    if (!calendarId) {
      setError('어느 캘린더에 넣을지 골라 주세요');
      return;
    }
    if (recurrence.freq && recurrence.until && recurrence.until < time.start) {
      setError('반복 종료일이 시작보다 앞섭니다');
      return;
    }
    setError(null);

    onSubmit({
      calendar_id: calendarId,
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      ...toTimeColumns(time),
      rrule: lockRecurrence ? null : buildRrule(recurrence),
    });
  }, [calendarId, description, location, lockRecurrence, onSubmit, recurrence, time, title]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput
        accessibilityLabel="일정 이름"
        value={title}
        onChangeText={setTitle}
        placeholder="무엇을 하나요?"
        placeholderTextColor={colors.textTertiary}
        maxLength={100}
        returnKeyType="next"
        style={[styles.titleInput, { color: colors.text }, titleTextStyle]}
      />

      <Divider />

      <View style={styles.optionRow}>
        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
        <ScrollView
          horizontal
          style={styles.optionScroller}
          contentContainerStyle={styles.optionScrollerContent}
          showsHorizontalScrollIndicator={false}>
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
                      borderColor: selected ? colors.accent : colors.borderStrong,
                    },
                  ]}>
                  {calendar.coverUrl ? (
                    <Image
                      source={{ uri: calendar.coverUrl }}
                      contentFit="cover"
                      style={[
                        styles.calendarThumbnail,
                        { borderColor: calendarColorForScheme(calendar.color, scheme) },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                      ]}
                    />
                  )}
                  <Txt variant="label" tone={selected ? 'accent' : 'secondary'}>
                    {calendar.name}
                  </Txt>
                </Pressable>
              );
            })}
        </ScrollView>
      </View>

      <Divider />

      <View style={styles.optionRow}>
        <Ionicons name="time-outline" size={20} color={colors.accent} />
        <Txt variant="body" style={styles.rowLabel}>
          종일
        </Txt>
        <Switch
          value={time.isAllDay}
          onValueChange={(next) => setTime((current) => switchAllDay(current, next))}
          trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
        />
      </View>

      <Divider />

      <CompactTimeRow label="시작">
        <DateTimeField
          hideLabel
          label="시작 날짜"
          mode="date"
          value={time.start}
          onChange={(next) => setTime((current) => moveStart(current, next))}
        />
        {!time.isAllDay ? (
          <DateTimeField
            hideLabel
            label="시작 시각"
            mode="time"
            value={time.start}
            onChange={(next) => setTime((current) => moveStart(current, next))}
          />
        ) : null}
      </CompactTimeRow>

      <CompactTimeRow label="종료">
        <DateTimeField
          hideLabel
          label="종료 날짜"
          mode="date"
          value={time.end}
          onChange={(next) => setTime((current) => moveEnd(current, next))}
        />
        {!time.isAllDay ? (
          <DateTimeField
            hideLabel
            label="종료 시각"
            mode="time"
            value={time.end}
            onChange={(next) => setTime((current) => moveEnd(current, next))}
          />
        ) : null}
      </CompactTimeRow>

      <Divider />

      <View style={styles.optionRow}>
        <Ionicons name="repeat-outline" size={20} color={colors.accent} />
        <Txt variant="body" style={styles.compactLabel}>
          반복
        </Txt>
        {lockRecurrence ? (
          <Txt variant="body" tone="secondary" style={styles.readOnlyValue}>
            {recurrence.freq ? FREQ_LABELS[recurrence.freq] : '안 함'}
          </Txt>
        ) : (
          <ScrollView
            horizontal
            style={styles.optionScroller}
            contentContainerStyle={styles.optionScrollerContent}
            showsHorizontalScrollIndicator={false}>
            {FREQ_OPTIONS.map((freq) => {
              const selected = freq === recurrence.freq;
              const label = freq ? FREQ_LABELS[freq] : '안 함';
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`반복 ${label}`}
                  onPress={() => setRecurrence((current) => ({ ...current, freq }))}
                  style={[
                    styles.calendarChip,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}>
                  <Txt variant="label" tone={selected ? 'accent' : 'secondary'}>
                    {label}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {!lockRecurrence && recurrence.freq ? (
        <>
          <Divider />
          <View style={styles.optionRow}>
            <Ionicons name="calendar-number-outline" size={20} color={colors.accent} />
            <Txt variant="body" style={styles.rowLabel}>
              종료일
            </Txt>
            {recurrence.until ? (
              <DateTimeField
                hideLabel
                label="반복 종료일"
                mode="date"
                value={recurrence.until}
                onChange={(next) =>
                  setRecurrence((current) => ({ ...current, until: next }))
                }
              />
            ) : null}
            <Switch
              value={recurrence.until !== null}
              onValueChange={(on) =>
                setRecurrence((current) => ({
                  ...current,
                  until: on ? defaultUntil(time.start) : null,
                }))
              }
              trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            />
          </View>
        </>
      ) : null}

      <Divider />

      <InlineInput
        icon="location-outline"
        accessibilityLabel="장소"
        value={location}
        onChangeText={setLocation}
        placeholder="장소 추가"
        maxLength={200}
      />

      <Divider />

      <InlineInput
        icon="document-text-outline"
        accessibilityLabel="메모"
        value={description}
        onChangeText={setDescription}
        placeholder="메모 추가"
        multiline
      />

      {children}

      {error ? (
        <View style={styles.formMessage}>
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        </View>
      ) : null}

      {showSubmitButton ? (
        <View style={styles.formAction}>
          <Button
            label={submitLabel}
            loading={pending}
            onPress={submit}
            disabled={submitDisabled}
          />
        </View>
      ) : null}

      {onDelete ? (
        <View style={styles.formAction}>
          <Button
            label={deleteLabel}
            variant="danger"
            size="md"
            onPress={onDelete}
            disabled={pending}
          />
        </View>
      ) : null}
    </View>
  );
});

function CompactTimeRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={styles.timeRow}>
      <Ionicons name="calendar-clear-outline" size={20} color={colors.accent} />
      <Txt variant="body" style={styles.rowLabel}>
        {label}
      </Txt>
      <View style={styles.timeControls}>{children}</View>
    </View>
  );
}

function InlineInput({
  icon,
  multiline = false,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { colors } = useTheme();
  const preferredTextStyle = usePreferredTextStyle(Typography.body);

  return (
    <View style={[styles.inlineInputRow, multiline && styles.inlineInputRowMultiline]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.inlineInput,
          multiline && styles.inlineInputMultiline,
          { color: colors.text },
          preferredTextStyle,
        ]}
      />
    </View>
  );
}

/** 반복 종료일 기본값 — 시작 1년 뒤 */
function defaultUntil(start: Date): Date {
  const until = new Date(start);
  until.setFullYear(until.getFullYear() + 1);
  return until;
}

const styles = StyleSheet.create({
  form: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
  },
  titleInput: {
    ...Typography.title,
    minHeight: 64,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  optionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  optionScroller: { flex: 1 },
  optionScrollerContent: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
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
  calendarThumbnail: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: Radius.sm,
  },
  compactLabel: { width: 36 },
  rowLabel: { flex: 1 },
  readOnlyValue: { marginLeft: 'auto' },
  timeRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  inlineInputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  inlineInputRowMultiline: { minHeight: 58, alignItems: 'flex-start', paddingTop: Spacing.md },
  inlineInput: { ...Typography.body, flex: 1, minHeight: 44, paddingVertical: Spacing.sm },
  inlineInputMultiline: {
    maxHeight: 58,
    paddingTop: 0,
    textAlignVertical: 'top',
  },
  formMessage: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  formAction: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
});
