import type { WallpaperLayout } from '@/stores/widget-preference';

export type WallpaperScreen = {
  width: number;
  height: number;
  scale: number;
};

export type WallpaperPalette = {
  background: string;
  backgroundAlt: string;
  card: string;
  cardMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  onAccent: string;
  sunday: string;
  saturday: string;
};

export type WallpaperEventItem = {
  key: string;
  title: string;
  timeLabel: string;
  calendarName: string;
  color: string;
  isAllDay: boolean;
  sortAt: number;
  endAt: number;
};

export type WallpaperDayItem = {
  key: string;
  eventCount: number;
  events: WallpaperEventItem[];
};

export type WallpaperMemoItem = {
  id: string;
  content: string;
  calendarName: string;
  color: string;
};

/** App Intent가 앱 프로세스 없이도 새 배경 이미지를 그릴 수 있는 최소 표시 데이터. */
export type LockScreenBoardSnapshot = {
  version: 1;
  cleared: boolean;
  generatedAt: string;
  expiresAt: string;
  dataStart: string;
  dataEnd: string;
  screen: WallpaperScreen;
  layout: WallpaperLayout;
  weekStart: 'sunday' | 'monday';
  showMemos: boolean;
  backgroundFile?: string;
  viewName: string;
  palette: WallpaperPalette;
  days: WallpaperDayItem[];
  memos: WallpaperMemoItem[];
};
