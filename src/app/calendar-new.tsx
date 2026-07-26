import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { CALENDAR_COLORS, DEFAULT_CALENDAR_COLOR, onColor } from '@/features/calendars/colors';
import { useCreateCalendar } from '@/features/calendars/queries';
import { useTheme } from '@/hooks/use-theme';

export default function NewCalendarScreen() {
  const { colors } = useTheme();
  const create = useCreateCalendar();

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_CALENDAR_COLOR);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setError('캘린더 이름을 입력해 주세요');
      return;
    }
    setError(null);

    create.mutate(
      { name, color },
      {
        onSuccess: (calendar) => {
          if (router.canGoBack()) router.back();
          router.push({ pathname: '/calendar/[id]', params: { id: calendar.id } });
        },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Content style={styles.content}>
          <View style={styles.intro}>
            <Txt variant="display">새 캘린더</Txt>
            <Txt variant="body" tone="secondary">
              만든 뒤 초대 링크를 보내면 함께 쓸 수 있습니다.
            </Txt>
          </View>

          <Field
            label="이름"
            value={name}
            onChangeText={setName}
            placeholder="가족, 우리 둘, 동아리…"
            maxLength={30}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <View style={styles.colorSection}>
            <Txt variant="label" tone="secondary">
              색
            </Txt>
            <View style={styles.swatches}>
              {CALENDAR_COLORS.map((option) => {
                const selected = option === color;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`색 ${option}`}
                    accessibilityState={{ selected }}
                    onPress={() => setColor(option)}
                    style={[
                      styles.swatch,
                      { backgroundColor: option },
                      selected && { borderColor: colors.text, borderWidth: 2 },
                    ]}>
                    {selected ? (
                      <Txt variant="caption" style={{ color: onColor(option) }}>
                        ✓
                      </Txt>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.previewDot, { backgroundColor: color }]} />
            <Txt variant="body">{name.trim() || '이름 없는 캘린더'}</Txt>
          </View>

          {error ? (
            <Txt variant="caption" tone="danger">
              {error}
            </Txt>
          ) : null}

          <Button label="만들기" loading={create.isPending} onPress={submit} />
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  colorSection: { gap: Spacing.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 2,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewDot: { width: 12, height: 12, borderRadius: Radius.pill },
});
