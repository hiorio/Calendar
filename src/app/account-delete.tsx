import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useDeleteAccount, useDeletionPreview } from '@/features/auth/delete-account';
import { useTheme } from '@/hooks/use-theme';

/** 실수로 누를 수 없게 직접 적게 한다 */
const CONFIRM_WORD = '삭제';

export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const { isGuest } = useAuth();
  const preview = useDeletionPreview();
  const remove = useDeleteAccount();

  const [typed, setTyped] = useState('');
  const confirmed = typed.trim() === CONFIRM_WORD;

  const transferred = preview.data?.transferred ?? [];
  const deleted = preview.data?.deleted ?? [];
  const leaving = preview.data?.leaving ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">계정 삭제</Txt>
          <Txt variant="body" tone="secondary">
            되돌릴 수 없습니다. 지우고 나면 같은 계정으로 다시 들어올 수 없습니다.
          </Txt>
        </View>

        {preview.isLoading ? (
          <Txt variant="body" tone="secondary">
            무엇이 사라지는지 확인하는 중…
          </Txt>
        ) : null}

        {preview.isError ? (
          <Notice tone="danger" title="미리 확인하지 못했습니다">
            {(preview.error as Error).message}
          </Notice>
        ) : null}

        {preview.data ? (
          <View style={styles.section}>
            <Txt variant="label" tone="secondary">
              이렇게 됩니다
            </Txt>

            <Card padded={false} style={styles.list}>
              <Outcome
                icon="trash-outline"
                tone="danger"
                title="함께 사라지는 캘린더"
                names={deleted}
                empty="없습니다"
                note="나 혼자 쓰던 캘린더입니다. 안에 있던 일정도 함께 지워집니다."
              />
              <Outcome
                icon="swap-horizontal-outline"
                title="다른 사람에게 넘어가는 캘린더"
                names={transferred}
                empty="없습니다"
                note="내가 만들었지만 함께 쓰는 사람이 있는 캘린더입니다. 가장 먼저 들어온 구성원이 소유자가 됩니다."
              />
              <Outcome
                icon="exit-outline"
                title="내가 나가는 캘린더"
                names={leaving}
                empty="없습니다"
                note="남의 캘린더입니다. 캘린더는 그대로 남습니다."
              />
            </Card>

            <Notice tone="info" title="내가 쓴 일정과 댓글은 남습니다">
              함께 보던 사람들의 기록이기도 해서 지우지 않습니다. 대신 이름이 빠지고
              &lsquo;알 수 없는 사용자&rsquo;로 보입니다.
            </Notice>
          </View>
        ) : null}

        {isGuest ? (
          <Notice tone="info" title="계정을 만들지 않은 상태입니다">
            지우면 이 기기에 쌓인 내용이 전부 사라집니다. 남겨 두고 싶다면 먼저 계정을
            만드세요.
          </Notice>
        ) : null}

        <View style={styles.section}>
          <Field
            label={`확인을 위해 '${CONFIRM_WORD}'라고 적어 주세요`}
            value={typed}
            onChangeText={setTyped}
            placeholder={CONFIRM_WORD}
            autoCapitalize="none"
          />
        </View>

        {remove.isError ? (
          <Txt variant="caption" tone="danger">
            지우지 못했습니다: {(remove.error as Error).message}
          </Txt>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="계정 삭제"
            variant="danger"
            disabled={!confirmed || preview.isLoading}
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(undefined, {
                // 세션이 사라지면 (app) 레이아웃이 알아서 계정 화면으로 보낸다.
                // 여기서는 쌓인 화면만 정리한다.
                onSuccess: () => router.replace('/'),
              })
            }
          />
          <Button label="그만두기" variant="ghost" onPress={() => router.back()} />
        </View>
      </Content>
    </ScrollView>
  );
}

function Outcome({
  icon,
  title,
  names,
  empty,
  note,
  tone = 'default',
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  names: string[];
  empty: string;
  note: string;
  tone?: 'default' | 'danger';
}) {
  const { colors } = useTheme();
  const accent = tone === 'danger' ? colors.danger : colors.textSecondary;

  return (
    <View style={styles.outcome}>
      <View style={styles.outcomeHead}>
        <Ionicons name={icon} size={16} color={accent} />
        <Txt variant="label" style={{ color: accent }}>
          {title}
        </Txt>
        <Txt variant="caption" tone="tertiary">
          {names.length > 0 ? `${names.length}개` : ''}
        </Txt>
      </View>

      {names.length > 0 ? (
        <View style={styles.names}>
          {names.map((name) => (
            <View key={name} style={[styles.pill, { backgroundColor: colors.surfaceMuted }]}>
              <Txt variant="caption">{name}</Txt>
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="caption" tone="tertiary">
          {empty}
        </Txt>
      )}

      {names.length > 0 ? (
        <Txt variant="caption" tone="tertiary">
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  intro: { gap: Spacing.xs },
  section: { gap: Spacing.sm },
  list: { padding: Spacing.lg, gap: Spacing.xl },
  outcome: { gap: Spacing.sm },
  outcomeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.pill },
  actions: { gap: Spacing.sm },
});
