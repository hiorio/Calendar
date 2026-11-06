import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppTheme } from '@/constants/theme';

export type SchemePreference = 'system' | 'light' | 'dark';
export type FontSizePreference = 'small' | 'standard' | 'large' | 'extraLarge';
export type FontFamilyPreference = 'system' | 'nanumGothic' | 'nanumMyeongjo';

type ThemePreferenceState = {
  theme: AppTheme;
  schemePreference: SchemePreference;
  fontSizePreference: FontSizePreference;
  fontFamilyPreference: FontFamilyPreference;
  setTheme: (theme: AppTheme) => void;
  setSchemePreference: (preference: SchemePreference) => void;
  setFontSizePreference: (preference: FontSizePreference) => void;
  setFontFamilyPreference: (preference: FontFamilyPreference) => void;
};

/** 계정과 무관한 이 기기의 화면 설정. 기본값은 브랜드 테마인 살구다. */
export const useThemePreference = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      theme: 'apricot',
      schemePreference: 'system',
      fontSizePreference: 'standard',
      fontFamilyPreference: 'system',
      setTheme: (theme) => set({ theme }),
      setSchemePreference: (schemePreference) => set({ schemePreference }),
      setFontSizePreference: (fontSizePreference) => set({ fontSizePreference }),
      setFontFamilyPreference: (fontFamilyPreference) => set({ fontFamilyPreference }),
    }),
    {
      name: 'timeline-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        schemePreference: state.schemePreference,
        fontSizePreference: state.fontSizePreference,
        fontFamilyPreference: state.fontFamilyPreference,
      }),
    },
  ),
);
