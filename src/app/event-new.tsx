import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { EventForm } from '@/features/events/event-form';
import { useCreateEvent } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { parseDateKey, startOfDay } from '@/lib/event-time';

export default function NewEventScreen() {
  const { colors } = useTheme();
  const { date, calendarId } = useLocalSearchParams<{ date?: string; calendarId?: string }>();

  const calendars = useMyCalendars();
  const create = useCreateEvent();

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

  // 선택한 날의 09:00~10:00을 기본으로 연다. 날짜 파라미터가 없으면 오늘.
  const base = date ? parseDateKey(date) : startOfDay(new Date());
  const start = new Date(base);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Content style={styles.content}>
          <EventForm
            calendars={calendars.data}
            submitLabel="추가"
            pending={create.isPending}
            initial={{
              calendarId: calendarId ?? calendars.data[0].id,
              title: '',
              location: '',
              description: '',
              time: { isAllDay: false, start, end },
            }}
            onSubmit={(input) =>
              create.mutate(input, {
                onSuccess: () => router.back(),
              })
            }
          />

          {create.isError ? (
            <Txt variant="caption" tone="danger">
              저장하지 못했습니다: {(create.error as Error).message}
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
