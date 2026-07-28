import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WeekStart = 'sunday' | 'monday';

type CalendarPreferenceState = {
  weekStart: WeekStart;
  showWeekNumbers: boolean;
  showLunar: boolean;
  showTimeZone: boolean;
  colorSaturday: boolean;
  setWeekStart: (weekStart: WeekStart) => void;
  setShowWeekNumbers: (showWeekNumbers: boolean) => void;
  setShowLunar: (showLunar: boolean) => void;
  setShowTimeZone: (showTimeZone: boolean) => void;
  setColorSaturday: (colorSaturday: boolean) => void;
};

/** 계정과 무관하게 이 기기에서만 유지되는 캘린더 표시 설정. */
export const useCalendarPreference = create<CalendarPreferenceState>()(
  persist(
    (set) => ({
      weekStart: 'sunday',
      showWeekNumbers: false,
      showLunar: false,
      showTimeZone: false,
      colorSaturday: true,
      setWeekStart: (weekStart) => set({ weekStart }),
      setShowWeekNumbers: (showWeekNumbers) => set({ showWeekNumbers }),
      setShowLunar: (showLunar) => set({ showLunar }),
      setShowTimeZone: (showTimeZone) => set({ showTimeZone }),
      setColorSaturday: (colorSaturday) => set({ colorSaturday }),
    }),
    {
      name: 'timeline-calendar-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        weekStart,
        showWeekNumbers,
        showLunar,
        showTimeZone,
        colorSaturday,
      }) => ({ weekStart, showWeekNumbers, showLunar, showTimeZone, colorSaturday }),
    },
  ),
);
