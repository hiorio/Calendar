import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  Dimensions,
  Linking,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Content } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyCalendars } from '@/features/calendars/queries';
import { useDeviceCalendarEvents } from '@/features/external-calendars/queries';
import { monthGridRange, useMonthEvents } from '@/features/events/queries';
import { useMemos } from '@/features/memos/queries';
import { lockScreenBoardSupported } from '@/features/wallpaper/capability';
import { LockScreenBoardPreview } from '@/features/wallpaper/preview';
import { buildLockScreenBoardSnapshot } from '@/features/wallpaper/snapshot';
import {
  lockScreenBackgroundUri,
  removeLockScreenBackground,
  storeLockScreenBackground,
} from '@/features/wallpaper/storage';
import { visibleCalendarIds } from '@/features/widgets/widget-policy';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addMonths, startOfMonth } from '@/lib/date';
import { notify } from '@/lib/confirm';
import { useCalendarFilter } from '@/stores/calendar-filter';
import { useCalendarPreference } from '@/stores/calendar-preference';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';
import { useWidgetPreference, type WallpaperLayout } from '@/stores/widget-preference';

const LAYOUT_OPTIONS: readonly { value: WallpaperLayout; label: string }[] = [
  { value: 'agenda', label: '오늘' },
  { value: 'month', label: '월간' },
];

const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;

export default function LockScreenBoardScreen() {
  const { colors, theme } = useTheme();
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { weekStart } = useCalendarPreference();
  const calendars = useMyCalendars();
  const month = useMemo(() => startOfMonth(new Date()), []);
  const events = useMonthEvents(month, weekStart);
  const deviceRange = useMemo(() => monthGridRange(month, weekStart), [month, weekStart]);
  const deviceEvents = useDeviceCalendarEvents(deviceRange.start, deviceRange.end);
  const deviceCalendarConnected = useDeviceCalendarPreference((state) => state.connected);
  const selectedDeviceCalendarIds = useDeviceCalendarPreference((state) => state.selectedIds);
  const memos = useMemos();
  const hiddenCalendarIds = useCalendarFilter((state) => state.hidden);
  const calendarMode = useWidgetPreference((state) => state.calendarMode);
  const selectedCalendarIds = useWidgetPreference((state) => state.selectedCalendarIds);
  const enabled = useWidgetPreference((state) => state.wallpaperEnabled);
  const layout = useWidgetPreference((state) => state.wallpaperLayout);
  const backgroundMode = useWidgetPreference((state) => state.wallpaperBackgroundMode);
  const showMemos = useWidgetPreference((state) => state.wallpaperShowMemos);
  const backgroundRevision = useWidgetPreference(
    (state) => state.wallpaperBackgroundRevision,
  );
  const setLayout = useWidgetPreference((state) => state.setWallpaperLayout);
  const setEnabled = useWidgetPreference((state) => state.setWallpaperEnabled);
  const setBackgroundMode = useWidgetPreference(
    (state) => state.setWallpaperBackgroundMode,
  );
  const setShowMemos = useWidgetPreference((state) => state.setWallpaperShowMemos);
  const touchBackground = useWidgetPreference((state) => state.touchWallpaperBackground);
  const [backgroundUri, setBackgroundUri] = useState(() => lockScreenBackgroundUri());
  const [picking, setPicking] = useState(false);

  const now = useMemo(() => new Date(), []);
  const visibleIds = useMemo(
    () =>
      visibleCalendarIds(
        calendars.data ?? [],
        calendarMode,
        selectedCalendarIds,
        hiddenCalendarIds,
      ),
    [calendarMode, calendars.data, hiddenCalendarIds, selectedCalendarIds],
  );
  const snapshot = useMemo(() => {
    const screen = Dimensions.get('screen');
    return buildLockScreenBoardSnapshot({
      now,
      expiresAt: addMonths(month, 1),
      dataStart: month,
      dataEnd: addMonths(month, 1),
      screen: { width: screen.width, height: screen.height, scale: PixelRatio.get() },
      layout,
      weekStart,
      showMemos,
      backgroundMode,
      systemScheme,
      theme,
      mode: calendarMode,
      visibleCalendarIds: visibleIds,
      visibleDeviceCalendarIds: new Set(deviceCalendarConnected ? selectedDeviceCalendarIds : []),
      events: events.data ?? [],
      deviceEvents: deviceEvents.data ?? [],
      memos: memos.data ?? [],
    });
  }, [
    backgroundMode,
    calendarMode,
    deviceCalendarConnected,
    deviceEvents.data,
    events.data,
    layout,
    memos.data,
    month,
    now,
    showMemos,
    selectedDeviceCalendarIds,
    systemScheme,
    theme,
    visibleIds,
    weekStart,
  ]);

  async function chooseBackground() {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.fileSize ?? 0) > MAX_BACKGROUND_BYTES) {
        throw new Error('배경사진은 25MB 이하로 골라 주세요.');
      }
      const uri = await storeLockScreenBackground(asset.uri);
      setBackgroundUri(uri);
      setBackgroundMode('photo');
      touchBackground();
    } catch (error) {
      notify('배경사진을 저장하지 못했어요', error instanceof Error ? error.message : String(error));
    } finally {
      setPicking(false);
    }
  }

  function useThemeBackground() {
    try {
      removeLockScreenBackground();
      setBackgroundUri(null);
      setBackgroundMode('theme');
      touchBackground();
    } catch (error) {
      notify('배경사진을 지우지 못했어요', error instanceof Error ? error.message : String(error));
    }
  }

  async function openShortcuts() {
    try {
      await Linking.openURL('shortcuts://');
    } catch {
      notify('단축어 앱을 열 수 없어요', 'iPhone에서 단축어 앱이 설치되어 있는지 확인해 주세요.');
    }
  }

  if (!lockScreenBoardSupported) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}>
        <Content style={styles.content}>
          <View style={styles.intro}>
            <Txt variant="body" tone="secondary">
              일정이 들어간 배경화면을 자동으로 만듭니다.
            </Txt>
          </View>
          <Notice title="iPhone의 새 앱 버전이 필요해요">
            이 기능은 iOS 16 이상과 잠금화면 보드 기능이 포함된 앱에서 사용할 수 있습니다.
          </Notice>
        </Content>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Content style={styles.content}>
        <View style={styles.intro}>
          <Txt variant="body" tone="secondary">
            보드 모양과 배경을 고른 뒤, 단축어에 한 번 연결하면 일정 배경화면을 갱신할 수 있어요.
          </Txt>
        </View>

        <View style={styles.previewSection}>
          <LockScreenBoardPreview
            snapshot={snapshot}
            backgroundUri={backgroundMode === 'photo' ? backgroundUri : null}
            backgroundRevision={backgroundRevision}
            now={now}
          />
          <Txt variant="micro" tone="tertiary" style={styles.centeredNote}>
            미리보기의 시계는 예시예요. 실제 시계는 iPhone 설정을 따릅니다.
          </Txt>
          {deviceCalendarConnected && selectedDeviceCalendarIds.length > 0 && !deviceEvents.data ? (
            <Txt variant="caption" tone={deviceEvents.isError ? 'danger' : 'secondary'} style={styles.centeredNote}>
              {deviceEvents.isError ? '연결된 기기 캘린더를 불러오지 못했어요.' : '연결된 기기 캘린더를 불러오는 중이에요.'}
            </Txt>
          ) : null}
        </View>

        <Section title="사용">
          <Card padded={false}>
            <ListRow
              icon="lock-closed-outline"
              title="잠금화면 보드 사용"
              subtitle="켜야 단축어에 최신 일정이 전달돼요"
              right={
                <Switch
                  accessibilityLabel="잠금화면 보드 사용"
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                />
              }
            />
          </Card>
          {!enabled ? (
            <Txt variant="caption" tone="secondary" style={styles.note}>
              모양을 고른 뒤 켜 주세요. 꺼진 상태에서 단축어를 실행하면 안내 이미지만 나옵니다.
            </Txt>
          ) : null}
        </Section>

        <Section title="보드 모양">
          <Segmented options={LAYOUT_OPTIONS} value={layout} onChange={setLayout} />
          <Txt variant="caption" tone="secondary" style={styles.note}>
            {layout === 'agenda'
              ? '이번 주와 오늘 일정, 남은 메모를 시간순으로 보여 줍니다.'
              : '이번 달 달력과 그 아래 오늘 일정을 보여 줍니다.'}
          </Txt>
        </Section>

        <Section title="배경">
          <Card padded={false}>
            <BackgroundOption
              icon="contrast-outline"
              title="시스템 설정에 맞춤"
              subtitle="iPhone의 밝게·어둡게 설정 사용"
              selected={backgroundMode === 'system'}
              onPress={() => setBackgroundMode('system')}
            />
            <Divider />
            <BackgroundOption
              icon="color-palette-outline"
              title="어두운 테마"
              subtitle="현재 TimeFlower 테마의 어두운 색"
              selected={backgroundMode === 'theme'}
              onPress={useThemeBackground}
            />
            <Divider />
            <BackgroundOption
              icon="sunny-outline"
              title="밝은 테마"
              subtitle="현재 TimeFlower 테마의 밝은 색"
              selected={backgroundMode === 'light'}
              onPress={() => setBackgroundMode('light')}
            />
            <Divider />
            <BackgroundOption
              icon="image-outline"
              title={backgroundUri ? '선택한 사진' : '내 사진'}
              subtitle="사진을 골라 배경으로 사용"
              selected={backgroundMode === 'photo' && Boolean(backgroundUri)}
              onPress={chooseBackground}
              loading={picking}
            />
          </Card>
          {backgroundMode === 'system' ? (
            <Txt variant="caption" tone="secondary" style={styles.note}>
              밝게·어둡게 설정이 바뀌면 앱을 열고 단축어를 다시 실행해 주세요.
            </Txt>
          ) : null}
        </Section>

        <Section title="표시할 내용">
          <Card padded={false}>
            <ListRow
              icon="calendar-outline"
              title="앱 캘린더 범위"
              subtitle="홈·잠금화면 위젯과 같은 표시 범위"
              value={calendarMode === 'app' ? undefined : snapshot.viewName}
              onPress={() => router.push('/widget-settings' as Href)}
            />
            <Divider />
            <ListRow
              icon="link-outline"
              title="기기 캘린더"
              subtitle="iPhone에서 연결하고 표시하도록 선택한 일정"
              value={deviceCalendarConnected ? `${selectedDeviceCalendarIds.length}개 표시` : '연결 안 됨'}
              onPress={() => router.push('/external-calendars' as Href)}
            />
            <Divider />
            <ListRow
              title="남은 메모"
              subtitle="오늘 보드 아래에 완료하지 않은 메모 표시"
              right={
                <Switch
                  accessibilityLabel="잠금화면 보드에 남은 메모 표시"
                  value={showMemos}
                  onValueChange={setShowMemos}
                  trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                />
              }
            />
          </Card>
          <Txt variant="caption" tone="secondary" style={styles.note}>
            명절은 기기 캘린더에서 공휴일 캘린더를 표시하도록 선택한 경우에 함께 나옵니다.
          </Txt>
        </Section>

        <Section title="잠금화면에 적용하기">
          <Card style={styles.stepsCard}>
            <Step number={1} title="단축어 앱에서 새 단축어 만들기">
              아래 버튼을 눌러 단축어 앱을 열고 오른쪽 위 +를 누르세요.
            </Step>
            <Step number={2} title="TimeFlower 동작 추가">
              동작 검색에서 ‘TimeFlower 잠금화면 배경 만들기’를 추가하세요.
            </Step>
            <Step number={3} title="만든 이미지를 잠금화면에 연결">
              ‘배경화면 사진 설정’을 다음 동작으로 추가하고, 사진 입력에 바로 앞 동작의 결과를 넣으세요. 잠금화면을 선택하고 ‘미리보기 표시’를 끄세요.
            </Step>
            <Step number={4} title="한 번 실행해 확인하기">
              ▶를 눌러 잠금화면에 적용되는지 확인하세요.
            </Step>
            <Step number={5} title="원하면 자동 갱신하기" last>
              단축어 앱의 ‘자동화’에서 매일 아침이나 ‘TimeFlower를 닫을 때’를 고르고, 방금 만든 단축어를 ‘즉시 실행’으로 저장하세요.
            </Step>
            <Button
              label={enabled ? '단축어 앱 열기' : '먼저 잠금화면 보드를 켜 주세요'}
              variant="secondary"
              disabled={!enabled}
              onPress={openShortcuts}
            />
          </Card>
        </Section>

        <Txt variant="caption" tone="secondary" style={styles.note}>
          일정을 바꾼 뒤 TimeFlower를 열면 최신 내용이 준비됩니다. 배경화면은 단축어를 실행할 때 갱신돼요.
        </Txt>

        <Notice title="큰 카드는 배경화면의 일부예요">
          카드 안을 누르거나 스크롤할 수 없고, 다음 자동화가 실행될 때 내용이 갱신됩니다.
        </Notice>
        <Notice title="일정 데이터는 기기 안에서만 전달해요">
          로그인 키는 단축어에 넘기지 않습니다. 앱이 접근 권한을 확인한 일정과 메모만 최소
          스냅샷으로 복사하며, 계정이나 표시 범위가 바뀌면 먼저 비웁니다.
        </Notice>
        <Notice title="이미 적용한 배경화면은 iPhone이 보관해요">
          기능을 끄거나 로그아웃하면 공유 데이터와 생성 파일은 지우지만, 현재 잠금화면은 직접
          다른 배경화면으로 바꿀 때까지 그대로 남을 수 있습니다.
        </Notice>
      </Content>
    </ScrollView>
  );
}

function BackgroundOption({
  icon,
  title,
  subtitle,
  selected,
  loading = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  selected: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backgroundOption,
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <View style={[styles.backgroundIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={19} color={colors.accent} />
      </View>
      <View style={styles.optionText}>
        <Txt variant="bodyStrong">{loading ? '사진을 저장하는 중…' : title}</Txt>
        <Txt variant="caption" tone="secondary">
          {subtitle}
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

function Step({
  number,
  title,
  children,
  last = false,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={[styles.stepNumber, { backgroundColor: colors.accent }]}>
          <Txt variant="caption" tone="onAccent">
            {number}
          </Txt>
        </View>
        {!last ? <View style={[styles.stepLine, { backgroundColor: colors.border }]} /> : null}
      </View>
      <View style={styles.stepText}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="caption" tone="secondary">
          {children}
        </Txt>
      </View>
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
  previewSection: { gap: Spacing.sm },
  centeredNote: { textAlign: 'center' },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingLeft: Spacing.xs },
  note: { paddingHorizontal: Spacing.xs },
  backgroundOption: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backgroundIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, gap: 1 },
  stepsCard: { gap: 0 },
  step: { minHeight: 72, flexDirection: 'row', gap: Spacing.md },
  stepRail: { width: 28, alignItems: 'center' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: StyleSheet.hairlineWidth, flex: 1 },
  stepText: { flex: 1, gap: 2, paddingBottom: Spacing.lg },
});
