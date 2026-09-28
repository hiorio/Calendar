import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Layout, Radius, Spacing, ThemePalettes, type AppTheme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useThemePreference,
  type FontFamilyPreference,
  type FontSizePreference,
  type SchemePreference,
} from '@/stores/theme-preference';

const THEME_OPTIONS: { id: AppTheme; title: string; description: string }[] = [
  { id: 'apricot', title: '살구', description: '따뜻하고 편안한 기본 테마' },
  { id: 'indigo', title: '쪽빛', description: '차분하고 또렷한 파란 테마' },
  { id: 'ink', title: '먹빛', description: '선명한 흑백과 청록 포인트' },
];
const SCHEME_OPTIONS: { id: SchemePreference; title: string }[] = [
  { id: 'system', title: '기기 설정' },
  { id: 'light', title: '라이트' },
  { id: 'dark', title: '다크' },
];
const FONT_SIZE_OPTIONS: { id: FontSizePreference; title: string }[] = [
  { id: 'small', title: '작게' },
  { id: 'standard', title: '보통' },
  { id: 'large', title: '크게' },
  { id: 'extraLarge', title: '매우 크게' },
];
const FONT_FAMILY_OPTIONS: { id: FontFamilyPreference; title: string }[] = [
  { id: 'system', title: '기본' },
  { id: 'nanumGothic', title: '나눔고딕' },
  { id: 'nanumMyeongjo', title: '나눔명조' },
];

export default function AppearanceSettingsScreen() {
  const { colors } = useTheme();
  const schemePreference = useThemePreference((state) => state.schemePreference);
  const fontSizePreference = useThemePreference((state) => state.fontSizePreference);
  const fontFamilyPreference = useThemePreference((state) => state.fontFamilyPreference);
  const setSchemePreference = useThemePreference((state) => state.setSchemePreference);
  const setFontSizePreference = useThemePreference((state) => state.setFontSizePreference);
  const setFontFamilyPreference = useThemePreference((state) => state.setFontFamilyPreference);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>
      <Content style={styles.content}>
        <Section title="앱 색">
          <Card padded={false}>
            {THEME_OPTIONS.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Divider /> : null}
                <ThemeOption {...option} />
              </View>
            ))}
          </Card>
        </Section>
        <Section title="밝기">
          <Card padded={false}>
            <ChoiceSetting title="화면 스타일" subtitle="기본값은 iPhone의 라이트·다크 모드를 따릅니다."
              options={SCHEME_OPTIONS} value={schemePreference} onChange={setSchemePreference} />
          </Card>
        </Section>
        <Section title="글자">
          <Card padded={false}>
            <ChoiceSetting title="폰트 크기" subtitle="기기의 손쉬운 사용 글자 크기도 함께 반영됩니다."
              options={FONT_SIZE_OPTIONS} value={fontSizePreference} onChange={setFontSizePreference} />
            <Divider />
            <ChoiceSetting title="폰트" subtitle="한글 본문과 일정 제목에 적용됩니다."
              options={FONT_FAMILY_OPTIONS} value={fontFamilyPreference} onChange={setFontFamilyPreference} />
          </Card>
        </Section>
        <Txt variant="micro" tone="tertiary" style={styles.note}>
          테마와 글자 설정은 이 기기에만 적용됩니다.
        </Txt>
      </Content>
    </ScrollView>
  );
}

function ChoiceSetting<T extends string>({ title, subtitle, options, value, onChange }: {
  title: string;
  subtitle: string;
  options: { id: T; title: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.choiceSetting}>
      <View style={styles.choiceLabel}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="caption" tone="secondary">{subtitle}</Txt>
      </View>
      <View accessibilityRole="radiogroup" style={styles.choiceOptions}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.id)} style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: selected ? colors.accentSoft : colors.surfaceMuted,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && { backgroundColor: colors.surfacePressed },
              ]}>
              <Txt variant="caption" tone={selected ? 'accent' : 'secondary'}>{option.title}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ThemeOption({ id, title, description }: { id: AppTheme; title: string; description: string }) {
  const { colors, theme } = useTheme();
  const setTheme = useThemePreference((state) => state.setTheme);
  const selected = theme === id;
  const preview = ThemePalettes[id].light;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title} 테마`} onPress={() => setTheme(id)}
      style={({ pressed }) => [styles.themeOption, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={[styles.themePreview, { backgroundColor: preview.background, borderColor: preview.border }]}>
        <View style={[styles.themeChrome, { backgroundColor: preview.chrome }]} />
        <View style={[styles.themeAccent, { backgroundColor: preview.accent }]} />
      </View>
      <View style={styles.themeText}>
        <View style={styles.themeTitle}>
          <Txt variant="bodyStrong">{title}</Txt>
          {id === 'apricot' ? (
            <View style={[styles.defaultTag, { backgroundColor: colors.accentSoft }]}>
              <Txt variant="micro" tone="accent">기본</Txt>
            </View>
          ) : null}
        </View>
        <Txt variant="caption" tone="secondary">{description}</Txt>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={21}
        color={selected ? colors.accent : colors.textTertiary} />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="tertiary" style={styles.sectionTitle}>{title}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.xxl },
  content: { flex: 0, gap: Spacing.xl, paddingHorizontal: Spacing.xl },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  note: { paddingHorizontal: Spacing.xs },
  choiceSetting: { gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  choiceLabel: { gap: 2 },
  choiceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choice: { minHeight: Layout.minTouchTarget, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  themeOption: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  themePreview: { width: 48, height: 42, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', padding: 6, gap: 6 },
  themeChrome: { height: 7, borderRadius: Radius.pill },
  themeAccent: { width: 22, height: 14, borderRadius: 5, alignSelf: 'flex-end' },
  themeText: { flex: 1, gap: 1 },
  themeTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  defaultTag: { borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
});
