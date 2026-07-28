import {
  ThemePalettes,
  type AppTheme,
  type ColorScheme,
  type ThemeColors,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemePreference } from '@/stores/theme-preference';

export type Scheme = ColorScheme;

/** 현재 배색과 스킴. 색이 필요한 모든 곳은 여기를 통한다. */
export function useTheme(): {
  colors: ThemeColors;
  scheme: Scheme;
  theme: AppTheme;
} {
  const raw = useColorScheme();
  const scheme: Scheme = raw === 'dark' ? 'dark' : 'light';
  const theme = useThemePreference((state) => state.theme);

  return { colors: ThemePalettes[theme][scheme], scheme, theme };
}
