/**
 * 디자인 토큰.
 *
 * 색은 항상 이 파일에서 가져온다. 화면에 하드코딩된 hex를 두지 않는다.
 * 사용자 테마 세 벌이 각각 라이트/다크 키를 유지한다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;
  chrome: string;
  chromeText: string;
  chromeBorder: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  onAccent: string;

  border: string;
  borderStrong: string;

  accent: string;
  accentSoft: string;
  accentPressed: string;

  danger: string;
  dangerSoft: string;

  sunday: string;
  saturday: string;

  shadow: string;
};

export type AppTheme = 'apricot' | 'indigo' | 'ink';
export type ColorScheme = 'light' | 'dark';

export const ThemePalettes: Record<AppTheme, Record<ColorScheme, ThemeColors>> = {
  apricot: {
    light: {
    /** 화면 바탕 */
    background: '#FBF8F5',
    /** 카드·시트처럼 바탕 위에 올라오는 면 */
    surface: '#FFFFFF',
    /** surface 위에 한 겹 더 (입력창, 눌린 상태) */
    surfaceMuted: '#F3EDE7',
    surfacePressed: '#E9DFD7',
    chrome: '#FFFFFF',
    chromeText: '#241C18',
    chromeBorder: '#ECE3DA',

    text: '#241C18',
    textSecondary: '#6B5E56',
    textTertiary: '#A5978D',
    /** 컬러 위에 얹는 글자 */
    onAccent: '#FFFFFF',

    border: '#ECE3DA',
    borderStrong: '#D8CABE',

    accent: '#E2673F',
    accentSoft: '#FCEEE7',
    accentPressed: '#C9552F',

    danger: '#B01B3F',
    dangerSoft: '#FBE7EC',

    /** 한국 달력 관례: 일요일 빨강, 토요일 파랑 */
    sunday: '#D9453F',
    saturday: '#3E7BC4',

    shadow: '#241C18',
    },
    dark: {
    background: '#14100E',
    surface: '#1E1815',
    surfaceMuted: '#292120',
    surfacePressed: '#332A27',
    chrome: '#1E1815',
    chromeText: '#F6EFEA',
    chromeBorder: '#2E2622',

    text: '#F6EFEA',
    textSecondary: '#B3A49A',
    textTertiary: '#7A6C63',
    onAccent: '#FFFFFF',

    border: '#2E2622',
    borderStrong: '#443A34',

    accent: '#F0855E',
    accentSoft: '#35211A',
    accentPressed: '#D97049',

    danger: '#F2607F',
    dangerSoft: '#341620',

    sunday: '#F0736C',
    saturday: '#6BA3E0',

    shadow: '#000000',
    },
  },
  indigo: {
    light: {
      background: '#F5F6FA',
      surface: '#FFFFFF',
      surfaceMuted: '#EDEFF5',
      surfacePressed: '#E1E4EE',
      chrome: '#FFFFFF',
      chromeText: '#171A24',
      chromeBorder: '#E3E6EF',

      text: '#171A24',
      textSecondary: '#5A6072',
      textTertiary: '#949AAB',
      onAccent: '#FFFFFF',

      border: '#E3E6EF',
      borderStrong: '#CDD2E0',

      accent: '#4A57C8',
      accentSoft: '#ECEEFB',
      accentPressed: '#3B47AC',

      danger: '#D5343C',
      dangerSoft: '#FDEBEC',

      sunday: '#DC3D43',
      saturday: '#4A57C8',

      shadow: '#171A24',
    },
    dark: {
      background: '#0E0F14',
      surface: '#171922',
      surfaceMuted: '#20232E',
      surfacePressed: '#2A2E3B',
      chrome: '#171922',
      chromeText: '#EEF0F6',
      chromeBorder: '#262938',

      text: '#EEF0F6',
      textSecondary: '#A0A6B8',
      textTertiary: '#6B7183',
      onAccent: '#FFFFFF',

      border: '#262938',
      borderStrong: '#3A3F52',

      accent: '#8B95EC',
      accentSoft: '#1E2140',
      accentPressed: '#7680DC',

      danger: '#F0666C',
      dangerSoft: '#2C171B',

      sunday: '#F0666C',
      saturday: '#8B95EC',

      shadow: '#000000',
    },
  },
  ink: {
    light: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceMuted: '#F2F3F4',
      surfacePressed: '#E6E8EA',
      chrome: '#191B1E',
      chromeText: '#F4F5F6',
      chromeBorder: '#191B1E',

      text: '#101214',
      textSecondary: '#5A5F66',
      textTertiary: '#91979E',
      onAccent: '#FFFFFF',

      border: '#E6E8EA',
      borderStrong: '#CDD1D5',

      accent: '#0E8C8C',
      accentSoft: '#E3F3F3',
      accentPressed: '#0B7373',

      danger: '#CC3333',
      dangerSoft: '#FCEAEA',

      sunday: '#D63A3A',
      saturday: '#2F6FD0',

      shadow: '#101214',
    },
    dark: {
      background: '#0B0C0D',
      surface: '#141618',
      surfaceMuted: '#1D2022',
      surfacePressed: '#262A2D',
      chrome: '#000000',
      chromeText: '#F1F2F3',
      chromeBorder: '#232628',

      text: '#F1F2F3',
      textSecondary: '#9AA0A6',
      textTertiary: '#676D73',
      onAccent: '#FFFFFF',

      border: '#232628',
      borderStrong: '#34383C',

      accent: '#2FB3B3',
      accentSoft: '#102A2A',
      accentPressed: '#269898',

      danger: '#EF5F5F',
      dangerSoft: '#2B1516',

      sunday: '#EF5F5F',
      saturday: '#5D94E0',

      shadow: '#000000',
    },
  },
};

/** 기존 호출부와 외부 도구의 기본값은 살구로 유지한다. */
export const Colors = ThemePalettes.apricot;
export type ThemeColor = keyof ThemeColors;

/** 4의 배수. 이름 대신 숫자를 쓰면 화면마다 값이 흔들린다. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const Typography = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof Typography;

/** 그림자는 두 단계면 충분하다. 남발하면 화면이 지저분해진다. */
export const Elevation = {
  card: Platform.select({
    ios: { shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 4px 12px rgba(36, 28, 24, 0.06)' },
  }),
  floating: Platform.select({
    ios: { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: { boxShadow: '0 6px 20px rgba(36, 28, 24, 0.18)' },
  }),
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** 화면 본문 최대 너비. 태블릿/웹에서 줄이 너무 길어지는 것을 막는다. */
export const MaxContentWidth = 560;
