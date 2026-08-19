import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { calendarColorForScheme } from '@/features/calendars/colors';
import { type MyCalendar, useMyCalendars } from '@/features/calendars/queries';
import { useTheme } from '@/hooks/use-theme';
import {
  type WidgetCalendarMode,
  useWidgetPreference,
} from '@/stores/widget-preference';

const MODE_OPTIONS: {
  id: WidgetCalendarMode;
  title: string;
  description: string;
}[] = [
  {
    id: 'app',
    title: '앱과 같게',
    description: '캘린더 화면에서 숨긴 항목을 위젯에서도 숨깁니다.',
  },
  { id: 'all', title: '모두 보기', description: '내가 접근할 수 있는 캘린더를 모두 표시합니다.' },
  { id: 'custom', title: '직접 선택', description: '위젯에 필요한 캘린더만 고릅니다.' },
];

export default function WidgetSettingsScreen() {
  const { colors, scheme } = useTheme();
  const calendars = useMyCalendars();
  const calendarMode = useWidgetPreference((state) => state.calendarMode);
  const selectedCalendarIds = useWidgetPreference((state) => state.selectedCalendarIds);
  const quickAddCalendarId = useWidgetPreference((state) => state.quickAddCalendarId);
  const showQuickActions = useWidgetPreference((state) => state.showQuickActions);
  const setCalendarMode = useWidgetPreference((state) => state.setCalendarMode);
  const toggleCalendar = useWidgetPreference((state) => state.toggleCalendar);
  const setQuickAddCalendar = useWidgetPreference((state) => state.setQuickAddCalendar);
  const setShowQuickActions = useWidgetPreference((state) => state.setShowQuickActions);

  const mine = calendars.data?.filter((calendar) => calendar.memberCount <= 1) ?? [];
  const shared = calendars.data?.filter((calendar) => calendar.memberCount > 1) ?? [];
  const quickTarget = calendars.data?.find((calendar) => calendar.id === quickAddCalendarId);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">위젯</Txt>
          <Txt variant="body" tone="secondary">
            바탕화면과 잠금화면에서 볼 일정과 빠른 작성 위치를 정합니다.
          </Txt>
        </View>

        <Section title="표시할 캘린더">
          <Card padded={false}>
            {MODE_OPTIONS.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: calendarMode === option.id }}
                  onPress={() => setCalendarMode(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && { backgroundColor: colors.surfacePressed },
                  ]}>
                  <View style={styles.optionText}>
                    <Txt variant="bodyStrong">{option.title}</Txt>
                    <Txt variant="caption" tone="secondary">
                      {option.description}
                    </Txt>
                  </View>
                  <Ionicons
                    name={calendarMode === option.id ? 'radio-button-on' : 'radio-button-off'}
                    size={21}
                    color={calendarMode === option.id ? colors.accent : colors.textTertiary}
                  />
                </Pressable>
              </View>
            ))}
          </Card>

          {calendarMode === 'custom' ? (
            calendars.data?.length ? (
              <View style={styles.groups}>
                <CalendarGroup
                  calendars={mine}
                  selectedIds={selectedCalendarIds}
                  title="나만 쓰는 캘린더"
                  onToggle={toggleCalendar}
                />
                <CalendarGroup
                  calendars={shared}
                  selectedIds={selectedCalendarIds}
                  title="함께 쓰는 캘린더"
                  onToggle={toggleCalendar}
                />
                {selectedCalendarIds.length === 0 ? (
                  <Notice title="아직 고른 캘린더가 없어요">
                    선택하기 전까지 위젯에는 모든 캘린더를 표시합니다.
                  </Notice>
                ) : null}
              </View>
            ) : (
              <Card>
                <EmptyState
                  compact
                  icon="calendar-outline"
                  title={calendars.isPending ? '캘린더를 불러오는 중이에요' : '캘린더가 없어요'}
                />
              </Card>
            )
          ) : null}
        </Section>

        <Section title="빠른 작성">
          <Card padded={false}>
            <View style={styles.switchRow}>
              <View style={styles.optionText}>
                <Txt variant="bodyStrong">일정·메모 버튼</Txt>
                <Txt variant="caption" tone="secondary">
                  홈 위젯에서 빠른 작성 화면을 바로 엽니다.
                </Txt>
              </View>
              <Switch
                accessibilityLabel="위젯 빠른 작성 버튼"
                value={showQuickActions}
                onValueChange={setShowQuickActions}
                trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
              />
            </View>
          </Card>

          {showQuickActions ? (
            <View style={styles.groups}>
              <Txt variant="caption" tone="secondary">
                새 항목을 저장할 캘린더
              </Txt>
              <Card padded={false}>
                {(calendars.data ?? []).map((calendar, index) => {
                  const selected = calendar.id === quickAddCalendarId;
                  return (
                    <View key={calendar.id}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setQuickAddCalendar(calendar.id)}
                        style={({ pressed }) => [
                          styles.calendarRow,
                          pressed && { backgroundColor: colors.surfacePressed },
                        ]}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                          ]}
                        />
                        <View style={styles.optionText}>
                          <Txt variant="body">{calendar.name}</Txt>
                          <Txt variant="caption" tone="secondary">
                            {calendar.memberCount > 1
                              ? `구성원 ${calendar.memberCount}명에게 공유됨`
                              : '나만 사용'}
                          </Txt>
                        </View>
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={21}
                          color={selected ? colors.accent : colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </Card>

              {!quickTarget && (calendars.data?.length ?? 0) > 1 ? (
                <Notice title="빠른 작성 위치를 골라 주세요">
                  개인 내용이 공유 캘린더에 잘못 저장되지 않도록 자동으로 고르지 않습니다.
                </Notice>
              ) : null}

              <Txt variant="micro" tone="tertiary" style={styles.note}>
                iCloud·Google 등 기기 캘린더는 현재 읽기 전용이라 빠른 작성 대상으로 고를 수
                없습니다.
              </Txt>
            </View>
          ) : null}
        </Section>
      </Content>
    </ScrollView>
  );
}

function CalendarGroup({
  calendars,
  selectedIds,
  title,
  onToggle,
}: {
  calendars: MyCalendar[];
  selectedIds: string[];
  title: string;
  onToggle: (calendarId: string) => void;
}) {
  const { colors, scheme } = useTheme();
  if (calendars.length === 0) return null;

  return (
    <View style={styles.group}>
      <Txt variant="caption" tone="secondary">
        {title}
      </Txt>
      <Card padded={false}>
        {calendars.map((calendar, index) => {
          const selected = selectedIds.includes(calendar.id);
          return (
            <View key={calendar.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => onToggle(calendar.id)}
                style={({ pressed }) => [
                  styles.calendarRow,
                  pressed && { backgroundColor: colors.surfacePressed },
                ]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: calendarColorForScheme(calendar.color, scheme) },
                  ]}
                />
                <View style={styles.optionText}>
                  <Txt variant="body">{calendar.name}</Txt>
                  <Txt variant="caption" tone="secondary">
                    {calendar.memberCount > 1 ? `구성원 ${calendar.memberCount}명` : '나만 사용'}
                  </Txt>
                </View>
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={selected ? colors.accent : colors.textTertiary}
                />
              </Pressable>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  groups: { gap: Spacing.md },
  group: { gap: Spacing.sm },
  option: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  calendarRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  optionText: { flex: 1, gap: 2 },
  dot: { width: 12, height: 12, borderRadius: Radius.pill },
  note: { paddingHorizontal: Spacing.xs },
});
