import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { useCreateMemo } from '@/features/memos/queries';
import { QuickCalendarPicker } from '@/features/widgets/quick-calendar-picker';
import { useTheme } from '@/hooks/use-theme';

export default function QuickMemoScreen() {
  const { colors } = useTheme();
  const { calendarId } = useLocalSearchParams<{ calendarId?: string }>();
  const calendars = useMyCalendars();
  const create = useCreateMemo();
  const [content, setContent] = useState('');
  const [chosenCalendarId, setChosenCalendarId] = useState(calendarId ?? '');
  const selectedCalendarId = calendars.data?.some((calendar) => calendar.id === chosenCalendarId)
    ? chosenCalendarId
    : calendars.data?.length === 1
      ? calendars.data[0].id
      : '';

  async function submit() {
    if (!content.trim() || !selectedCalendarId) return;
    try {
      await create.mutateAsync({ calendarId: selectedCalendarId, content });
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
          icon="document-text-outline"
          title="먼저 캘린더가 필요해요"
          description="메모는 캘린더 안에 저장됩니다."
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
            <Txt variant="display">퀵 메모</Txt>
            <Txt variant="body" tone="secondary">
              떠오른 내용을 바로 남기고 캘린더 구성원과 함께 봅니다.
            </Txt>
          </View>

          <Card style={styles.form}>
            <Field
              autoFocus
              multiline
              label="메모"
              value={content}
              onChangeText={setContent}
              placeholder={selectedCalendar ? `${selectedCalendar.name}에 메모` : '메모 내용'}
              maxLength={500}
              style={styles.input}
              textAlignVertical="top"
            />

            <QuickCalendarPicker
              calendars={calendars.data}
              selectedId={selectedCalendarId}
              onChange={setChosenCalendarId}
            />

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
              label="메모 저장"
              loading={create.isPending}
              disabled={!content.trim() || !selectedCalendarId}
              onPress={() => void submit()}
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
  input: { minHeight: 128, paddingTop: Spacing.lg },
  center: { justifyContent: 'center', paddingHorizontal: Spacing.xl },
});
