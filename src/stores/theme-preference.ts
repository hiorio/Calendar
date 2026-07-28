import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppTheme } from '@/constants/theme';

type ThemePreferenceState = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

/** 계정과 무관한 이 기기의 화면 설정. 기본값은 브랜드 테마인 살구다. */
export const useThemePreference = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      theme: 'apricot',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'timeline-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
