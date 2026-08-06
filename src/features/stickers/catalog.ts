import type { ImageSource } from 'expo-image';

export const STICKER_KEYS = [
  'morning-reader',
  'garden-sprout',
  'star-celebration',
  'rainy-window',
  'heart-rest',
  'autumn-picnic',
] as const;

export type StickerKey = (typeof STICKER_KEYS)[number];

export type StickerDefinition = {
  key: StickerKey;
  label: string;
  /** 날짜 상세 배너와 선택 타일에 쓰는 장면 이미지 */
  source: ImageSource;
  /** 월간 격자의 작은 칸에 쓰는 투명 배경 캐릭터 */
  cutoutSource: ImageSource;
};

export const STICKERS: readonly StickerDefinition[] = [
  {
    key: 'morning-reader',
    label: '포근한 아침',
    source: require('../../../assets/stickers/morning-reader.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/morning-reader.png'),
  },
  {
    key: 'garden-sprout',
    label: '새싹 물주기',
    source: require('../../../assets/stickers/garden-sprout.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/garden-sprout.png'),
  },
  {
    key: 'star-celebration',
    label: '별빛 축하',
    source: require('../../../assets/stickers/star-celebration.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/star-celebration.png'),
  },
  {
    key: 'rainy-window',
    label: '비 오는 창가',
    source: require('../../../assets/stickers/rainy-window.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/rainy-window.png'),
  },
  {
    key: 'heart-rest',
    label: '포근한 휴식',
    source: require('../../../assets/stickers/heart-rest.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/heart-rest.png'),
  },
  {
    key: 'autumn-picnic',
    label: '가을 소풍',
    source: require('../../../assets/stickers/autumn-picnic.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/autumn-picnic.png'),
  },
];

export function isStickerKey(value: string): value is StickerKey {
  return STICKER_KEYS.includes(value as StickerKey);
}

export function stickerByKey(value: string | undefined): StickerDefinition | null {
  return STICKERS.find((sticker) => sticker.key === value) ?? null;
}
