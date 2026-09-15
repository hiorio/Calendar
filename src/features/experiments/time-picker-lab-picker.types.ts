export type TimePickerLabVariant = 'digit-auto' | 'digit-composed' | 'digit-hold';

export type TimePickerLabPickerProps = {
  value: Date;
  variant: TimePickerLabVariant;
  /** 실제 일정 입력에서는 실험용 안내 문구를 제거하고 값을 폼에 반영한다. */
  purpose?: 'experiment' | 'event';
  onCancel: () => void;
  onConfirm: (value: Date) => void;
};
