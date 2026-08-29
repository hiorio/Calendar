import type { ImageSource } from 'expo-image';

export const STICKER_KEYS = [
  'morning-reader',
  'garden-sprout',
  'star-celebration',
  'rainy-window',
  'heart-rest',
  'autumn-picnic',
  'cake-party',
  'flower-gift',
  'beach-day',
  'moon-sleep',
  'happy-baking',
  'workout-cheer',
] as const;

export type StickerKey = (typeof STICKER_KEYS)[number];

export type StickerDefinition = {
  key: StickerKey;
  label: string;
  /** 날짜 상세 배너와 선택 타일에 쓰는 장면 이미지 */
  source: ImageSource;
  /** 월간 격자의 작은 칸에 쓰는 투명 배경 캐릭터 */
  cutoutSource: ImageSource;
  /** 장면 이미지가 아닌 투명 컷아웃을 부드러운 테마 배경 위에 표시한다. */
  display?: 'scene' | 'cutout';
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
  {
    key: 'cake-party',
    label: '생일 파티',
    source: require('../../../assets/stickers/cake-party.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/cake-party.png'),
  },
  {
    key: 'flower-gift',
    label: '꽃다발 선물',
    source: require('../../../assets/stickers/flower-gift.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/flower-gift.png'),
  },
  {
    key: 'beach-day',
    label: '바닷가 휴가',
    source: require('../../../assets/stickers/beach-day.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/beach-day.png'),
  },
  {
    key: 'moon-sleep',
    label: '달빛 단잠',
    source: require('../../../assets/stickers/moon-sleep.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/moon-sleep.png'),
  },
  {
    key: 'happy-baking',
    label: '쿠키 굽기',
    source: require('../../../assets/stickers/happy-baking.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/happy-baking.png'),
  },
  {
    key: 'workout-cheer',
    label: '오늘도 운동',
    source: require('../../../assets/stickers/workout-cheer.jpg'),
    cutoutSource: require('../../../assets/stickers/cutouts/workout-cheer.png'),
  },
];

export function isStickerKey(value: string): value is StickerKey {
  return STICKER_KEYS.includes(value as StickerKey);
}

export function stickerByKey(value: string | undefined): StickerDefinition | null {
  return STICKERS.find((sticker) => sticker.key === value) ?? null;
}
