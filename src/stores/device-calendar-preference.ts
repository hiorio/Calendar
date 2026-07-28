import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DeviceCalendarPreferenceState = {
  connected: boolean;
  selectedIds: string[];
  connect: (calendarIds: string[]) => void;
  toggleCalendar: (calendarId: string) => void;
  disconnect: () => void;
};

/** 기기 캘린더 권한 자체가 아니라 TimeLine 안에서의 연결·표시 선택을 저장한다. */
export const useDeviceCalendarPreference = create<DeviceCalendarPreferenceState>()(
  persist(
    (set) => ({
      connected: false,
      selectedIds: [],
      connect: (calendarIds) => set({ connected: true, selectedIds: calendarIds }),
      toggleCalendar: (calendarId) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(calendarId)
            ? state.selectedIds.filter((id) => id !== calendarId)
            : [...state.selectedIds, calendarId],
        })),
      disconnect: () => set({ connected: false, selectedIds: [] }),
    }),
    {
      name: 'timeline-device-calendars',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ connected, selectedIds }) => ({ connected, selectedIds }),
    },
  ),
);
