import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'info' | 'danger';

export type NoticeProps = {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
};

/** 화면 안에서 짚고 넘어가야 하는 상태를 알린다. 토스트가 아니라 붙박이. */
export function Notice({ tone = 'info', title, children }: NoticeProps) {
  const { colors } = useTheme();
  const accent = tone === 'danger' ? colors.danger : colors.accent;
  const background = tone === 'danger' ? colors.dangerSoft : colors.accentSoft;

  return (
    <View style={[styles.wrap, { backgroundColor: background }]}>
      <Ionicons
        name={tone === 'danger' ? 'alert-circle' : 'information-circle'}
        size={18}
        color={accent}
        style={styles.icon}
      />
      <View style={styles.text}>
        <Txt variant="label" style={{ color: accent }}>
          {title}
        </Txt>
        {children ? (
          <Txt variant="caption" tone="secondary">
            {children}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, gap: 2 },
});
