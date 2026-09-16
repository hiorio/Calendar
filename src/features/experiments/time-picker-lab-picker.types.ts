export type TimePickerLabVariant = 'digit-auto' | 'digit-composed';

export type TimePickerLabPickerProps = {
  value: Date;
  variant: TimePickerLabVariant;
  /** 실제 일정 입력과 설정 체험에서는 실험용 안내 문구를 제거한다. */
  purpose?: 'experiment' | 'event' | 'preview';
  onCancel: () => void;
  onConfirm: (value: Date) => void;
};
