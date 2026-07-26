/** 캘린더에 고를 수 있는 색. 설계안 4.1의 기본값(#4A90D9)이 첫 번째다. */
export const CALENDAR_COLORS = [
  '#4A90D9',
  '#2FB6A6',
  '#5FB85F',
  '#E8A33D',
  '#E06C5A',
  '#D45D9B',
  '#8B7BD8',
  '#6B7683',
] as const;

export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLORS[0];

/** 배경색 위에 글자를 얹을 때 대비를 확보한다 */
export function onColor(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  // 상대 휘도 근사
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#16181D' : '#FFFFFF';
}
