import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Content } from '@/components/ui/screen';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing, ThemePalettes, type AppTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
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

export default function PreferencesScreen() {
  const { colors } = useTheme();
  const { isGuest, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const deviceCalendarsConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendars = useDeviceCalendarPreference((state) => state.selectedIds.length);
  const schemePreference = useThemePreference((state) => state.schemePreference);
  const fontSizePreference = useThemePreference((state) => state.fontSizePreference);
  const fontFamilyPreference = useThemePreference((state) => state.fontFamilyPreference);
  const setSchemePreference = useThemePreference((state) => state.setSchemePreference);
  const setFontSizePreference = useThemePreference((state) => state.setFontSizePreference);
  const setFontFamilyPreference = useThemePreference((state) => state.setFontFamilyPreference);
  const {
    weekStart,
    showWeekNumbers,
    showLunar,
    showTimeZone,
    colorSaturday,
    setWeekStart,
    setShowWeekNumbers,
    setShowLunar,
    setShowTimeZone,
    setColorSaturday,
  } = useCalendarPreference();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('로그아웃 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="display">설정</Txt>
          <Txt variant="body" tone="secondary">
            이 기기에서 보이는 캘린더와 알림 방식을 정합니다.
          </Txt>
        </View>

        <Section title="일반">
          <Card padded={false}>
            <ListRow
              title="언어"
              subtitle="영어 지원을 위한 다국어 구조는 다음 배포 단계에서 연결합니다."
              value="한국어"
            />
            <Divider />
            <ListRow
              title="한 주의 시작"
              value={weekStart === 'sunday' ? '일요일' : '월요일'}
              onPress={() => setWeekStart(weekStart === 'sunday' ? 'monday' : 'sunday')}
            />
            <Divider />
            <SwitchRow
              title="주 번호"
              subtitle="월간 캘린더 왼쪽에 ISO 주 번호 표시"
              value={showWeekNumbers}
              onValueChange={setShowWeekNumbers}
            />
            <Divider />
            <SwitchRow
              title="음력"
              subtitle="날짜 아래에 음력 일을 함께 표시"
              value={showLunar}
              onValueChange={setShowLunar}
            />
            <Divider />
            <SwitchRow
              title="시간대 표시"
              subtitle="일정 상세에서 일정 기준 시간대를 함께 표시"
              value={showTimeZone}
              onValueChange={setShowTimeZone}
            />
          </Card>
        </Section>

        <Section title="알림">
          <Card padded={false}>
            <ListRow
              icon="notifications-outline"
              title="앱 알림과 캘린더별 알림"
              subtitle="이 기기 등록과 캘린더 음소거 관리"
              onPress={() => router.push('/notifications')}
            />
          </Card>
        </Section>

        <Section title="외부 캘린더">
          <Card padded={false}>
            <ListRow
              icon="calendar-outline"
              title="기기 캘린더"
              subtitle="iCloud·Google·구독 캘린더를 읽기 전용으로 표시"
              value={
                deviceCalendarsConnected ? `${selectedDeviceCalendars}개 표시` : '연결 안 됨'
              }
              onPress={() => router.push('/external-calendars')}
            />
          </Card>
        </Section>

        <Section title="표시">
          <Card padded={false}>
            <ChoiceSetting
              title="화면 스타일"
              subtitle="기본값은 iPhone의 라이트·다크 모드를 따릅니다."
              options={SCHEME_OPTIONS}
              value={schemePreference}
              onChange={setSchemePreference}
            />
            <Divider />
            <ChoiceSetting
              title="폰트 크기"
              subtitle="기기의 손쉬운 사용 글자 크기도 함께 반영됩니다."
              options={FONT_SIZE_OPTIONS}
              value={fontSizePreference}
              onChange={setFontSizePreference}
            />
            <Divider />
            <ChoiceSetting
              title="폰트"
              subtitle="한글 본문과 일정 제목에 적용됩니다."
              options={FONT_FAMILY_OPTIONS}
              value={fontFamilyPreference}
              onChange={setFontFamilyPreference}
            />
            <Divider />
            <SwitchRow
              title="토요일을 파란색으로"
              value={colorSaturday}
              onValueChange={setColorSaturday}
            />
          </Card>
        </Section>

        <Section title="화면 테마">
          <Card padded={false}>
            {THEME_OPTIONS.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Divider /> : null}
                <ThemeOption {...option} />
              </View>
            ))}
          </Card>
          <Txt variant="micro" tone="tertiary" style={styles.note}>
            테마와 캘린더 표시 설정은 이 기기에만 적용됩니다.
          </Txt>
        </Section>

        <Section title="계정">
          <Card padded={false}>
            {isGuest ? (
              <>
                <ListRow
                  icon="person-add-outline"
                  title="계정 만들기"
                  subtitle="현재 데이터를 유지한 채 계정으로 전환"
                  onPress={() => router.push('/account')}
                />
                <Divider />
                <ListRow
                  icon="log-in-outline"
                  title="이미 계정이 있어요"
                  subtitle="기존 계정으로 로그인"
                  onPress={() =>
                    router.push({ pathname: '/account', params: { mode: 'sign-in' } })
                  }
                />
              </>
            ) : (
              <ListRow
                icon="log-out-outline"
                title={signingOut ? '로그아웃 중…' : '로그아웃'}
                danger
                disabled={signingOut}
                onPress={handleSignOut}
              />
            )}
            <Divider />
            <ListRow
              icon="trash-outline"
              title="계정 삭제"
              subtitle="되돌릴 수 없습니다"
              danger
              onPress={() => router.push('/account-delete')}
            />
          </Card>
        </Section>
      </Content>
    </ScrollView>
  );
}

function ChoiceSetting<T extends string>({
  title,
  subtitle,
  options,
  value,
  onChange,
}: {
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
        <Txt variant="caption" tone="secondary">
          {subtitle}
        </Txt>
      </View>
      <View accessibilityRole="radiogroup" style={styles.choiceOptions}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: selected ? colors.accentSoft : colors.surfaceMuted,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && { backgroundColor: colors.surfacePressed },
              ]}>
              <Txt variant="caption" tone={selected ? 'accent' : 'secondary'}>
                {option.title}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
        />
      }
    />
  );
}

function ThemeOption({
  id,
  title,
  description,
}: {
  id: AppTheme;
  title: string;
  description: string;
}) {
  const { colors, theme } = useTheme();
  const setTheme = useThemePreference((state) => state.setTheme);
  const selected = theme === id;
  const preview = ThemePalettes[id].light;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title} 테마`}
      onPress={() => setTheme(id)}
      style={({ pressed }) => [
        styles.themeOption,
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <View
        style={[
          styles.themePreview,
          { backgroundColor: preview.background, borderColor: preview.border },
        ]}>
        <View style={[styles.themeChrome, { backgroundColor: preview.chrome }]} />
        <View style={[styles.themeAccent, { backgroundColor: preview.accent }]} />
      </View>
      <View style={styles.themeText}>
        <View style={styles.themeTitle}>
          <Txt variant="bodyStrong">{title}</Txt>
          {id === 'apricot' ? (
            <View style={[styles.defaultTag, { backgroundColor: colors.accentSoft }]}>
              <Txt variant="micro" tone="accent">
                기본
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt variant="caption" tone="secondary">
          {description}
        </Txt>
      </View>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={21}
        color={selected ? colors.accent : colors.textTertiary}
      />
    </Pressable>
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
  note: { paddingHorizontal: Spacing.xs },
  choiceSetting: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  choiceLabel: { gap: 2 },
  choiceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choice: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  themeOption: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  themePreview: {
    width: 48,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 6,
    gap: 6,
  },
  themeChrome: { height: 7, borderRadius: Radius.pill },
  themeAccent: { width: 22, height: 14, borderRadius: 5, alignSelf: 'flex-end' },
  themeText: { flex: 1, gap: 1 },
  themeTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  defaultTag: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
});
