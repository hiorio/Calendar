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

/**
 * TimeFlower 의 색은 **따뜻한 베이지 지면 위의 테라코타**다.
 * 앱 아이콘·스플래시와 같은 색을 쓴다 (`scripts/make-icons.mjs`).
 *
 * 값은 눈으로 고르고 끝내지 않았다. 지면이 흰색이 아니라 베이지라 대비가 전부
 * 조금씩 내려가서, 아래 조합을 계산해 WCAG AA 를 넘긴 값만 남겼다. 색을 고칠 때는
 * `docs/design-notes.md` 의 대비 표를 함께 갱신할 것.
 */
const palette: Record<'light' | 'dark', ThemeColors> = {
  light: {
    /** 화면 바탕 — 살짝 누런 종이 */
    background: '#F5F0E7',
    /** 카드·시트처럼 바탕 위에 올라오는 면 */
    surface: '#FFFCF7',
    /** surface 위에 한 겹 더 (입력창, 눌린 상태) */
    surfaceMuted: '#EEE6D9',
    surfacePressed: '#E3D8C7',

    text: '#2A211B',
    textSecondary: '#6B5B4C',
    textTertiary: '#8E7B69',
    /** 컬러 위에 얹는 글자 */
    onAccent: '#FFFFFF',

    border: '#E6DACB',
    borderStrong: '#D3C3AF',

    accent: '#A94E32',
    accentSoft: '#F6E7DD',
    accentPressed: '#8C3E26',

    /**
     * 주황 브랜드에서 danger 를 그냥 빨강으로 두면 색상각이 10여 도밖에 안 벌어져
     * 적녹색약에서 사실상 같은 색이 된다. 자주 쪽으로 벌려 둔다.
     */
    danger: '#B01B3F',
    dangerSoft: '#F8E4E9',

    /** 한국 달력 관례: 일요일 빨강, 토요일 파랑. 베이지 지면에 맞춰 둘 다 깊게. */
    sunday: '#C33A34',
    saturday: '#3467A8',

    shadow: '#2A211B',
  },
  dark: {
    background: '#16120F',
    surface: '#211B16',
    surfaceMuted: '#2B231D',
    surfacePressed: '#372D25',

    text: '#F4ECE2',
    textSecondary: '#B6A493',
    textTertiary: '#7E6E5F',
    /**
     * 어둡게에서는 accent 가 밝은 테라코타라 흰 글자를 얹으면 2.5:1 밖에 안 나온다.
     * 채워진 accent 위에는 짙은 갈색을 얹는다.
     */
    onAccent: '#2E1C13',

    border: '#312820',
    borderStrong: '#473A2F',

    accent: '#E58C64',
    accentSoft: '#33211A',
    accentPressed: '#C97350',

    danger: '#F2607F',
    dangerSoft: '#341620',

    sunday: '#F0736C',
    saturday: '#7FAEE8',

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
    default: { boxShadow: '0 4px 12px rgba(42, 33, 27, 0.06)' },
  }),
  floating: Platform.select({
    ios: { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: { boxShadow: '0 6px 20px rgba(42, 33, 27, 0.18)' },
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
