import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function NewEventScreen() {
  return (
    <PlaceholderScreen
      title="일정 추가"
      icon="add-circle-outline"
      emptyTitle="일정을 적을 수 있게 됩니다"
      emptyDescription={'제목·시간·장소·반복까지.\n종일 일정은 시간 입력이 숨겨집니다.'}
      step="3단계 · 일정 CRUD / 4단계 · 반복"
    />
  );
}
