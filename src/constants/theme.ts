/**
 * 디자인 토큰.
 *
 * 색은 항상 이 파일에서 가져온다. 화면에 하드코딩된 hex를 두지 않는다.
 * 라이트/다크 두 벌을 같은 키로 유지해 `useTheme()`이 하나만 골라 준다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;

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

const palette: Record<'light' | 'dark', ThemeColors> = {
  light: {
    /** 화면 바탕 */
    background: '#F4F5F7',
    /** 카드·시트처럼 바탕 위에 올라오는 면 */
    surface: '#FFFFFF',
    /** surface 위에 한 겹 더 (입력창, 눌린 상태) */
    surfaceMuted: '#EEF0F4',
    surfacePressed: '#E4E7EC',

    text: '#16181D',
    textSecondary: '#5F6673',
    textTertiary: '#98A0AE',
    /** 컬러 위에 얹는 글자 */
    onAccent: '#FFFFFF',

    border: '#E3E6EB',
    borderStrong: '#CDD2DA',

    accent: '#3F7FD4',
    accentSoft: '#E8F1FC',
    accentPressed: '#3670BE',

    danger: '#DC3D43',
    dangerSoft: '#FDECEC',

    /** 한국 달력 관례: 일요일 빨강, 토요일 파랑 */
    sunday: '#DC3D43',
    saturday: '#3F7FD4',

    shadow: '#0B1220',
  },
  dark: {
    background: '#0E1014',
    surface: '#171A20',
    surfaceMuted: '#1F232B',
    surfacePressed: '#282D37',

    text: '#F1F3F7',
    textSecondary: '#A2AAB8',
    textTertiary: '#6C7482',
    onAccent: '#FFFFFF',

    border: '#262B34',
    borderStrong: '#39404C',

    accent: '#6BA5EE',
    accentSoft: '#18263A',
    accentPressed: '#5892DB',

    danger: '#F0575C',
    dangerSoft: '#2B1719',

    sunday: '#F0575C',
    saturday: '#6BA5EE',

    shadow: '#000000',
  },
};

export const Colors = palette;
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
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof Typography;

/** 그림자는 두 단계면 충분하다. 남발하면 화면이 지저분해진다. */
export const Elevation = {
  card: Platform.select({
    ios: { shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 4px 12px rgba(11, 18, 32, 0.06)' },
  }),
  floating: Platform.select({
    ios: { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: { boxShadow: '0 6px 20px rgba(11, 18, 32, 0.18)' },
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
