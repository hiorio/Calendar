import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useCalendarMembers } from '@/features/calendars/queries';
import { useParticipants, useToggleParticipant } from '@/features/events/participants';
import { useTheme } from '@/hooks/use-theme';

export type ParticipantPickerProps = {
  eventId: string;
  calendarId: string;
};

/** 이 일정에 누가 참여하는지. 캘린더 구성원 중에서 고른다. */
export function ParticipantPicker({ eventId, calendarId }: ParticipantPickerProps) {
  const { colors } = useTheme();
  const members = useCalendarMembers(calendarId);
  const participants = useParticipants(eventId);
  const toggle = useToggleParticipant(eventId);

  // 혼자 쓰는 캘린더에서 참여자를 고르는 것은 의미가 없다
  if (!members.data || members.data.length < 2) return null;

  const joinedIds = new Set((participants.data ?? []).map((p) => p.user_id));

  return (
    <View style={styles.section}>
      <Txt variant="label" tone="secondary">
        참여자
      </Txt>

      <View style={styles.chips}>
        {members.data.map((member) => {
          const joined = joinedIds.has(member.user_id);
          return (
            <Pressable
              key={member.user_id}
              accessibilityRole="button"
              accessibilityState={{ selected: joined }}
              accessibilityLabel={`${member.nickname} ${joined ? '빼기' : '넣기'}`}
              disabled={toggle.isPending}
              onPress={() => toggle.mutate({ userId: member.user_id, joined })}
              style={[
                styles.chip,
                {
                  backgroundColor: joined ? colors.accentSoft : colors.surface,
                  borderColor: joined ? colors.accent : colors.border,
                },
              ]}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: joined ? colors.accent : colors.surfaceMuted },
                ]}>
                <Txt variant="caption" tone={joined ? 'onAccent' : 'secondary'}>
                  {member.nickname.slice(0, 1)}
                </Txt>
              </View>
              <Txt variant="label" tone={joined ? 'accent' : 'secondary'}>
                {member.nickname}
              </Txt>
              {joined ? <Ionicons name="checkmark" size={13} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </View>

      {toggle.isError ? (
        <Txt variant="caption" tone="danger">
          참여자를 바꾸지 못했습니다: {(toggle.error as Error).message}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 36,
    paddingLeft: 4,
    paddingRight: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
