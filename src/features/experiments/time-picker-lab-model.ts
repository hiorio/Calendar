export type TimePickerMeridiem = 'am' | 'pm';

export type TimePickerParts = {
  meridiem: TimePickerMeridiem;
  hour12: number;
  coarseMinute: number;
  minute: number;
};

export function timePickerParts(value: Date): TimePickerParts {
  const hours = value.getHours();
  const minute = value.getMinutes();

  return {
    meridiem: hours < 12 ? 'am' : 'pm',
    hour12: hours % 12 === 0 ? 12 : hours % 12,
    coarseMinute: Math.floor(minute / 10) * 10,
    minute,
  };
}

export function exactMinuteOptions(coarseMinute: number): number[] {
  const normalized = Math.min(50, Math.max(0, Math.floor(coarseMinute / 10) * 10));
  return Array.from({ length: 10 }, (_, index) => normalized + index);
}

export function minuteDigitOptions(): number[] {
  return Array.from({ length: 10 }, (_, index) => index);
}

export function composeMinute(coarseMinute: number, minuteDigit: number): number {
  const normalizedCoarse = Math.min(50, Math.max(0, Math.floor(coarseMinute / 10) * 10));
  const normalizedDigit = Math.min(9, Math.max(0, Math.trunc(minuteDigit)));
  return normalizedCoarse + normalizedDigit;
}

export function applyTimePickerParts(value: Date, parts: TimePickerParts): Date {
  const next = new Date(value);
  const hour12 = Math.min(12, Math.max(1, Math.trunc(parts.hour12)));
  const hours = (hour12 % 12) + (parts.meridiem === 'pm' ? 12 : 0);
  const minute = Math.min(59, Math.max(0, Math.trunc(parts.minute)));
  next.setHours(hours, minute, 0, 0);
  return next;
}
