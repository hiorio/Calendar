import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { EventAttachments } from '@/features/events/attachments';
import { CommentThread } from '@/features/events/comment-thread';
import { ParticipantPicker } from '@/features/events/participant-picker';
import { ReminderPicker } from '@/features/events/reminder-picker';
import { useTheme } from '@/hooks/use-theme';

type Tool = 'attachments' | 'participants' | 'reminders' | 'comments';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
  { id: 'attachments', label: '첨부', icon: 'attach-outline' },
  { id: 'participants', label: '참여자', icon: 'people-outline' },
  { id: 'reminders', label: '알림', icon: 'alarm-outline' },
  { id: 'comments', label: '댓글', icon: 'chatbubble-outline' },
];

const TITLES: Record<Tool, string> = {
  attachments: '첨부 파일',
  participants: '참여자',
  reminders: '미리 알림',
  comments: '댓글',
};

export function EventDetailTools({
  eventId,
  calendarId,
  isRecurring,
}: {
  eventId: string;
  calendarId: string;
  isRecurring: boolean;
}) {
  const { colors } = useTheme();
  const [active, setActive] = useState<Tool | null>(null);

  return (
    <>
      <View
        style={[
          styles.toolBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        {TOOLS.map((tool, index) => (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            accessibilityLabel={`${tool.label} 설정 열기`}
            onPress={() => setActive(tool.id)}
            style={({ pressed }) => [
              styles.tool,
              index > 0 && { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth },
              pressed && { backgroundColor: colors.surfacePressed },
            ]}>
            <Ionicons name={tool.icon} size={20} color={colors.textSecondary} />
            <Txt variant="caption" tone="secondary">
              {tool.label}
            </Txt>
          </Pressable>
        ))}
      </View>

      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={active !== null}
        onRequestClose={() => setActive(null)}>
        <SafeAreaView
          edges={['top', 'bottom']}
          style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.headerSpacer} />
            <Txt accessibilityRole="header" variant="subtitle" style={styles.sheetTitle}>
              {active ? TITLES[active] : ''}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="상세 기능 닫기"
              onPress={() => setActive(null)}
              style={({ pressed }) => [
                styles.doneButton,
                { opacity: pressed ? 0.55 : 1 },
              ]}>
              <Txt variant="bodyStrong" tone="accent">
                완료
              </Txt>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}>
            {active === 'attachments' ? (
              <EventAttachments eventId={eventId} calendarId={calendarId} />
            ) : null}
            {active === 'participants' ? (
              <ParticipantPicker eventId={eventId} calendarId={calendarId} />
            ) : null}
            {active === 'reminders' ? <ReminderPicker eventId={eventId} /> : null}
            {active === 'comments' ? (
              <CommentThread eventId={eventId} isRecurring={isRecurring} />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toolBar: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  tool: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  sheet: { flex: 1 },
  sheetHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
  },
  doneButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  headerSpacer: { width: 44 },
  sheetTitle: { flex: 1, textAlign: 'center' },
  sheetContent: {
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
  },
});
