export type TimePickerStyle = 'system' | 'digit-auto' | 'digit-composed' | 'digit-hold';

export const DEFAULT_TIME_PICKER_STYLE: TimePickerStyle = 'system';

export const TIME_PICKER_STYLE_LABELS: Record<TimePickerStyle, string> = {
  system: '기본',
  'digit-auto': 'A타입',
  'digit-composed': 'B타입',
  'digit-hold': 'C타입',
};

/** 저장값이 오래됐거나 손상돼도 기존 iPhone 선택기로 안전하게 돌아간다. */
export function normalizeTimePickerStyle(value: unknown): TimePickerStyle {
  switch (value) {
    case 'system':
    case 'digit-auto':
    case 'digit-composed':
    case 'digit-hold':
      return value;
    default:
      return DEFAULT_TIME_PICKER_STYLE;
  }
}
