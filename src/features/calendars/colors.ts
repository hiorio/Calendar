/**
 * 캘린더 라벨 팔레트.
 *
 * 어둡고 밝은 색이 번갈아 오도록 만든 순서가 접근성 규칙이므로 바꾸지 않는다.
 * DB에는 light 배경을 안정적인 식별값으로 저장하고, 화면 밝기에 맞는 배경·글자 쌍을
 * 여기서 고른다.
 */
const CALENDAR_COLOR_SLOTS = [
  { light: ['#1B54A8', '#FFFFFF'], dark: ['#6F9FF0', '#071528'] },
  { light: ['#93B33A', '#1C2408'], dark: ['#B9D461', '#1C2408'] },
  { light: ['#A63363', '#FFFFFF'], dark: ['#DD6F9D', '#2C0C1A'] },
  { light: ['#4BB3C9', '#0B2A30'], dark: ['#6FD0E4', '#062930'] },
  { light: ['#12705F', '#FFFFFF'], dark: ['#35A58E', '#04231D'] },
  { light: ['#D8A72A', '#2B1F02'], dark: ['#EDC255', '#2B1F02'] },
  { light: ['#4F4EC4', '#FFFFFF'], dark: ['#8B8AEB', '#0F0E35'] },
  { light: ['#EE8A45', '#331803'], dark: ['#F5A973', '#331803'] },
  { light: ['#7A3FAE', '#FFFFFF'], dark: ['#AB77DD', '#200A33'] },
  { light: ['#9AA1AC', '#16191D'], dark: ['#B3BAC4', '#16191D'] },
  { light: ['#C3402C', '#FFFFFF'], dark: ['#E8705C', '#310C06'] },
  { light: ['#62B84E', '#10250A'], dark: ['#85D172', '#10250A'] },
] as const;

export const CALENDAR_COLORS = CALENDAR_COLOR_SLOTS.map((slot) => slot.light[0]);
export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLORS[0];

type ColorScheme = 'light' | 'dark';

function findSlot(hex: string) {
  const normalized = hex.toUpperCase();
  return CALENDAR_COLOR_SLOTS.find(
    (slot) => slot.light[0] === normalized || slot.dark[0] === normalized,
  );
}

/** DB의 안정적인 light 값을 현재 밝기에 맞는 화면 색으로 바꾼다. */
export function calendarColorForScheme(hex: string, scheme: ColorScheme): string {
  return findSlot(hex)?.[scheme][0] ?? hex;
}

/** 라벨 배경에 대응하는 명시적 전경색. 임의 색만 휘도로 계산한다. */
export function onColor(hex: string, scheme: ColorScheme = 'light'): string {
  const slot = findSlot(hex);
  if (slot) return slot[scheme][1];

  const value = calendarColorForScheme(hex, scheme).replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  // 상대 휘도 근사
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#16181D' : '#FFFFFF';
}
