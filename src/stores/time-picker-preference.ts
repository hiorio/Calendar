import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_TIME_PICKER_STYLE,
  normalizeTimePickerStyle,
  type TimePickerStyle,
} from '@/features/events/time-picker-style';

type TimePickerPreferenceState = {
  style: TimePickerStyle;
  setStyle: (style: TimePickerStyle) => void;
};

/** 계정과 무관하게 이 기기에서만 유지되는 일정 시각 입력 방식. */
export const useTimePickerPreference = create<TimePickerPreferenceState>()(
  persist(
    (set) => ({
      style: DEFAULT_TIME_PICKER_STYLE,
      setStyle: (style) => set({ style }),
    }),
    {
      name: 'timeline-time-picker-preference',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ style }) => ({ style }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<TimePickerPreferenceState> | null;
        return {
          ...current,
          style: normalizeTimePickerStyle(saved?.style),
        };
      },
    },
  ),
);
