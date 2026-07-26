import { Colors, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type Scheme = 'light' | 'dark';

/** 현재 배색과 스킴. 색이 필요한 모든 곳은 여기를 통한다. */
export function useTheme(): { colors: ThemeColors; scheme: Scheme } {
  const raw = useColorScheme();
  const scheme: Scheme = raw === 'dark' ? 'dark' : 'light';

  return { colors: Colors[scheme], scheme };
}
