export type TimePickerLabVariant = 'digit-auto' | 'digit-composed' | 'digit-hold';

export type TimePickerLabPickerProps = {
  value: Date;
  variant: TimePickerLabVariant;
  onCancel: () => void;
  onConfirm: (value: Date) => void;
};
