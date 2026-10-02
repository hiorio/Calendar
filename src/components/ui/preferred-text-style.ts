import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import {
  useThemePreference,
  type FontFamilyPreference,
  type FontSizePreference,
} from '@/stores/theme-preference';

export const FONT_SIZE_SCALES: Record<FontSizePreference, number> = {
  small: 0.92,
  standard: 1,
  large: 1.1,
  extraLarge: 1.2,
};

const FONT_FAMILIES: Record<
  Exclude<FontFamilyPreference, 'system'>,
  { regular: string; bold: string }
> = {
  nanumGothic: {
    regular: 'NanumGothic_400Regular',
    bold: 'NanumGothic_700Bold',
  },
  nanumMyeongjo: {
    regular: 'NanumMyeongjo_400Regular',
    bold: 'NanumMyeongjo_700Bold',
  },
};

/**
 * 앱의 글자 설정을 기존 타이포그래피 토큰 위에 적용한다.
 * RN의 시스템 접근성 배율은 그대로 두므로, 이 배율과 기기 글자 크기가 함께 반영된다.
 */
export function usePreferredTextStyle(style: StyleProp<TextStyle>): TextStyle {
  const fontSizePreference = useThemePreference((state) => state.fontSizePreference);
  const fontFamilyPreference = useThemePreference((state) => state.fontFamilyPreference);
  const flattened = StyleSheet.flatten(style) ?? {};
  const scale = FONT_SIZE_SCALES[fontSizePreference];
  const family =
    fontFamilyPreference === 'system'
      ? undefined
      : FONT_FAMILIES[fontFamilyPreference][isBold(flattened.fontWeight) ? 'bold' : 'regular'];

  return {
    fontSize:
      typeof flattened.fontSize === 'number'
        ? Math.round(flattened.fontSize * scale * 10) / 10
        : undefined,
    lineHeight:
      typeof flattened.lineHeight === 'number'
        ? Math.round(flattened.lineHeight * scale * 10) / 10
        : undefined,
    fontFamily: family,
    // Android는 등록한 폰트 이름과 별도의 weight를 함께 주면 시스템 폰트로 돌아갈 수 있다.
    fontWeight: family ? 'normal' : flattened.fontWeight,
  };
}

function isBold(weight: TextStyle['fontWeight']): boolean {
  if (weight === 'bold') return true;
  if (typeof weight !== 'string') return false;
  const numeric = Number(weight);
  return Number.isFinite(numeric) && numeric >= 600;
}
