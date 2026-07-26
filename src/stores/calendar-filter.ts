import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type CalendarFilterState = {
  /** 화면에서 숨긴 캘린더. 기본은 전부 표시라 "숨긴 것"만 들고 있는다. */
  hidden: string[];
  toggle: (calendarId: string) => void;
  isVisible: (calendarId: string) => boolean;
};

/**
 * 어떤 캘린더를 화면에 띄울지. 서버 상태가 아니라 이 기기의 보기 설정이라
 * TanStack Query가 아니라 여기 둔다 (설계안 2장).
 */
export const useCalendarFilter = create<CalendarFilterState>()(
  persist(
    (set, get) => ({
      hidden: [],
      toggle: (calendarId) =>
        set((state) => ({
          hidden: state.hidden.includes(calendarId)
            ? state.hidden.filter((id) => id !== calendarId)
            : [...state.hidden, calendarId],
        })),
      isVisible: (calendarId) => !get().hidden.includes(calendarId),
    }),
    {
      name: 'calendar-filter',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hidden: state.hidden }),
    },
  ),
);
