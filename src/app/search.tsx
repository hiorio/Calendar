import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useEventSearch } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatDayTitle } from '@/lib/date';
import { formatEventTimeRange } from '@/lib/event-time';

export default function SearchScreen() {
  const { colors, scheme } = useTheme();
  const [query, setQuery] = useState('');
  const results = useEventSearch(query);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">검색</Txt>
          <Txt variant="body" tone="secondary">
            내가 볼 수 있는 캘린더의 일정 제목을 찾습니다.
          </Txt>
        </View>

        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            accessibilityLabel="일정 검색어"
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="일정 이름 검색"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            style={[styles.input, { color: colors.text }]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {query.trim() ? (
          <View style={styles.section}>
            <Txt variant="label" tone="tertiary">
              검색 결과 {results.data?.length ?? 0}개
            </Txt>
            <Card padded={false}>
              {results.data?.length ? (
                results.data.map((event, index) => (
                  <View key={event.id}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({ pathname: '/event/[id]', params: { id: event.id } })
                      }
                      style={({ pressed }) => [
                        styles.result,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}>
                      <View
                        style={[
                          styles.colorBar,
                          {
                            backgroundColor: calendarColorForScheme(
                              event.displayColor,
                              scheme,
                            ),
                          },
                        ]}
                      />
                      <View style={styles.resultText}>
                        <Txt variant="bodyStrong">{event.title}</Txt>
                        <Txt variant="caption" tone="secondary">
                          {eventStartLabel(event)} · {formatEventTimeRange(event)}
                        </Txt>
                        <Txt variant="micro" tone="tertiary">
                          {event.calendarName}
                        </Txt>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                ))
              ) : results.isFetching ? (
                <EmptyState compact icon="search-outline" title="검색하고 있어요" />
              ) : (
                <EmptyState
                  compact
                  icon="search-outline"
                  title="찾은 일정이 없어요"
                  description="다른 제목으로 검색해 보세요."
                />
              )}
            </Card>
          </View>
        ) : (
          <Card>
            <EmptyState
              icon="search-outline"
              title="일정 이름을 입력해 주세요"
              description="최근 일정부터 최대 50개를 보여 줍니다."
            />
          </Card>
        )}

        {results.isError ? (
          <Txt variant="caption" tone="danger">
            검색하지 못했습니다: {(results.error as Error).message}
          </Txt>
        ) : null}
      </Content>
    </ScrollView>
  );
}

function eventStartLabel(event: {
  is_all_day: boolean;
  start_date: string | null;
  start_at: string | null;
}) {
  const date = event.is_all_day
    ? new Date(`${event.start_date}T12:00:00`)
    : new Date(event.start_at!);
  return formatDayTitle(date);
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xxl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  searchBox: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { ...Typography.body, flex: 1, height: '100%' },
  section: { gap: Spacing.sm },
  result: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  colorBar: { width: 4, height: 42, borderRadius: Radius.pill },
  resultText: { flex: 1, gap: 1 },
});
