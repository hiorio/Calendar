import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & {
  edges?: readonly Edge[];
};

/** 화면 바탕 + 세이프에어리어. 모든 탭 화면의 가장 바깥. */
export function Screen({ style, edges = ['top'], ...rest }: ScreenProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.screen, style]} {...rest} />
    </SafeAreaView>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  /** 오른쪽 액션 슬롯 */
  right?: React.ReactNode;
};

export function Header({ title, subtitle, right }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Txt variant="display">{title}</Txt>
        {subtitle ? (
          <Txt variant="body" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** 본문 폭 제한 컨테이너. 웹/태블릿에서 줄이 늘어지는 것을 막는다. */
export function Content({ style, ...rest }: ViewProps) {
  return <View style={[styles.content, style]} {...rest} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerText: { flex: 1, gap: 2 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
