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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolBarContent}>
          {TOOLS.map((tool) => (
            <Pressable
              key={tool.id}
              accessibilityRole="button"
              accessibilityLabel={`${tool.label} 설정 열기`}
              onPress={() => setActive(tool.id)}
              style={({ pressed }) => [
                styles.tool,
                {
                  backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
                },
              ]}>
              <Ionicons name={tool.icon} size={17} color={colors.accent} />
              <Txt variant="label">{tool.label}</Txt>
            </Pressable>
          ))}
        </ScrollView>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="상세 기능 닫기"
              hitSlop={8}
              onPress={() => setActive(null)}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { backgroundColor: colors.surfacePressed },
              ]}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Txt variant="title">{active ? TITLES[active] : ''}</Txt>
            <View style={styles.headerSpacer} />
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
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
  },
  toolBarContent: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tool: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
  },
  sheet: { flex: 1 },
  sheetHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  headerSpacer: { width: 44 },
  sheetContent: {
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
  },
});
