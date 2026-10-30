import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { usePreferredTextStyle } from '@/components/ui/preferred-text-style';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Layout, Radius, Spacing, Typography } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { useEventSearch } from '@/features/events/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatDayTitle } from '@/lib/date';
import { formatEventTimeRange } from '@/lib/event-time';

export default function SearchScreen() {
  const { colors, scheme } = useTheme();
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [limit, setLimit] = useState(50);
  useEffect(() => {
    if (query.trim() === settledQuery) return;
    const timer = setTimeout(() => { setSettledQuery(query.trim()); setLimit(50); }, 250);
    return () => clearTimeout(timer);
  }, [query, settledQuery]);
  const results = useEventSearch(settledQuery, limit);
  const waitingForInput = query.trim() !== settledQuery;
  const visibleResults = waitingForInput ? [] : (results.data ?? []).slice(0, limit);
  const hasMore = !waitingForInput && (results.data?.length ?? 0) > limit;
  const preferredInputStyle = usePreferredTextStyle(styles.input);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="body" tone="secondary">
            앱에 등록한 일정 제목을 찾습니다. 연결된 외부 캘린더는 해당 앱에서 검색해 주세요.
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
            onSubmitEditing={() => { setSettledQuery(query.trim()); setLimit(50); }}
            placeholder="일정 이름 검색"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            style={[styles.input, { color: colors.text }, preferredInputStyle]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              onPress={() => setQuery('')}
              style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {query.trim() ? (
          <View style={styles.section}>
            <Txt variant="label" tone="tertiary">
              {waitingForInput || results.isFetching ? '검색 중…' : `검색 결과 ${visibleResults.length}개${hasMore ? ' 이상' : ''}`}
            </Txt>
            <Card padded={false}>
              {visibleResults.length ? (
                visibleResults.map((event, index) => (
                  <View key={event.key}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({ pathname: '/event/[id]', params: { id: event.id, ...(event.originalStart ? { occ: event.originalStart } : {}) } })
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
              ) : results.isError && !waitingForInput ? (
                <EmptyState compact icon="cloud-offline-outline" title="검색하지 못했어요" description="연결을 확인하고 다시 시도해 주세요." />
              ) : results.isFetching || waitingForInput ? (
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
            {hasMore ? <Button label="검색 결과 더 보기" variant="ghost" loading={results.isFetching} onPress={() => setLimit((value) => value + 50)} /> : null}
          </View>
        ) : (
          <Card>
            <EmptyState
              icon="search-outline"
              title="일정 이름을 입력해 주세요"
              description="최근 일정부터 보여 주며, 결과가 많으면 더 볼 수 있습니다."
            />
          </Card>
        )}

        {results.isError && !waitingForInput && query.trim() ? (
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
    minHeight: Layout.prominentControlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    ...Typography.body,
    flex: 1,
    minHeight: Layout.minTouchTarget,
    paddingVertical: Spacing.sm,
  },
  clearButton: {
    width: Layout.minTouchTarget,
    height: Layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
