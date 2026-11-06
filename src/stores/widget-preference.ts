import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WidgetCalendarMode = 'app' | 'all' | 'custom';
export type WallpaperLayout = 'agenda' | 'month';
export type WallpaperBackgroundMode = 'theme' | 'light' | 'system' | 'photo';

type WidgetPreferenceState = {
  calendarMode: WidgetCalendarMode;
  selectedCalendarIds: string[];
  quickAddCalendarId: string | null;
  showQuickActions: boolean;
  wallpaperEnabled: boolean;
  wallpaperLayout: WallpaperLayout;
  wallpaperBackgroundMode: WallpaperBackgroundMode;
  wallpaperShowMemos: boolean;
  /** 사진 파일을 같은 이름으로 교체해도 App Group 스냅샷을 다시 발행하기 위한 값. */
  wallpaperBackgroundRevision: number;
  setCalendarMode: (calendarMode: WidgetCalendarMode) => void;
  toggleCalendar: (calendarId: string) => void;
  setQuickAddCalendar: (calendarId: string | null) => void;
  setShowQuickActions: (showQuickActions: boolean) => void;
  setWallpaperEnabled: (wallpaperEnabled: boolean) => void;
  setWallpaperLayout: (wallpaperLayout: WallpaperLayout) => void;
  setWallpaperBackgroundMode: (wallpaperBackgroundMode: WallpaperBackgroundMode) => void;
  setWallpaperShowMemos: (wallpaperShowMemos: boolean) => void;
  touchWallpaperBackground: () => void;
};

/**
 * 위젯은 계정 데이터가 아니라 이 기기의 보기 설정이다.
 *
 * 표시 대상은 여러 캘린더일 수 있지만 빠른 작성 대상은 정확히 하나만 둔다. 공유
 * 캘린더가 섞인 상황에서 목록 첫 항목을 암묵적으로 고르면 개인 메모가 공유될 수 있다.
 */
export const useWidgetPreference = create<WidgetPreferenceState>()(
  persist(
    (set) => ({
      calendarMode: 'app',
      selectedCalendarIds: [],
      quickAddCalendarId: null,
      showQuickActions: true,
      wallpaperEnabled: false,
      wallpaperLayout: 'agenda',
      wallpaperBackgroundMode: 'theme',
      wallpaperShowMemos: true,
      wallpaperBackgroundRevision: 0,
      setCalendarMode: (calendarMode) => set({ calendarMode }),
      toggleCalendar: (calendarId) =>
        set((state) => ({
          selectedCalendarIds: state.selectedCalendarIds.includes(calendarId)
            ? state.selectedCalendarIds.filter((id) => id !== calendarId)
            : [...state.selectedCalendarIds, calendarId],
        })),
      setQuickAddCalendar: (quickAddCalendarId) => set({ quickAddCalendarId }),
      setShowQuickActions: (showQuickActions) => set({ showQuickActions }),
      setWallpaperEnabled: (wallpaperEnabled) => set({ wallpaperEnabled }),
      setWallpaperLayout: (wallpaperLayout) => set({ wallpaperLayout }),
      setWallpaperBackgroundMode: (wallpaperBackgroundMode) =>
        set({ wallpaperBackgroundMode }),
      setWallpaperShowMemos: (wallpaperShowMemos) => set({ wallpaperShowMemos }),
      touchWallpaperBackground: () =>
        set((state) => ({
          wallpaperBackgroundRevision: state.wallpaperBackgroundRevision + 1,
        })),
    }),
    {
      name: 'timeline-widget-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        calendarMode,
        selectedCalendarIds,
        quickAddCalendarId,
        showQuickActions,
        wallpaperEnabled,
        wallpaperLayout,
        wallpaperBackgroundMode,
        wallpaperShowMemos,
      }) => ({
        calendarMode,
        selectedCalendarIds,
        quickAddCalendarId,
        showQuickActions,
        wallpaperEnabled,
        wallpaperLayout,
        wallpaperBackgroundMode,
        wallpaperShowMemos,
      }),
    },
  ),
);
