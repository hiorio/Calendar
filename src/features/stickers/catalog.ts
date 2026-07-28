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
  source: ImageSource;
};

export const STICKERS: readonly StickerDefinition[] = [
  {
    key: 'morning-reader',
    label: '포근한 아침',
    source: require('../../../assets/stickers/morning-reader.jpg'),
  },
  {
    key: 'garden-sprout',
    label: '새싹 물주기',
    source: require('../../../assets/stickers/garden-sprout.jpg'),
  },
  {
    key: 'star-celebration',
    label: '별빛 축하',
    source: require('../../../assets/stickers/star-celebration.jpg'),
  },
  {
    key: 'rainy-window',
    label: '비 오는 창가',
    source: require('../../../assets/stickers/rainy-window.jpg'),
  },
  {
    key: 'heart-rest',
    label: '포근한 휴식',
    source: require('../../../assets/stickers/heart-rest.jpg'),
  },
  {
    key: 'autumn-picnic',
    label: '가을 소풍',
    source: require('../../../assets/stickers/autumn-picnic.jpg'),
  },
];

export function isStickerKey(value: string): value is StickerKey {
  return STICKER_KEYS.includes(value as StickerKey);
}

export function stickerByKey(value: string | undefined): StickerDefinition | null {
  return STICKERS.find((sticker) => sticker.key === value) ?? null;
}
