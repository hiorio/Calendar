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

function persistedStyle(persisted: unknown): TimePickerStyle {
  if (!persisted || typeof persisted !== 'object') {
    return DEFAULT_TIME_PICKER_STYLE;
  }

  return normalizeTimePickerStyle((persisted as { style?: unknown }).style);
}

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
      version: 1,
      partialize: ({ style }) => ({ style }),
      migrate: (persisted) => ({ style: persistedStyle(persisted) }),
      merge: (persisted, current) => {
        return {
          ...current,
          style: persistedStyle(persisted),
        };
      },
    },
  ),
);
