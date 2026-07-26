import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ActivityScreen() {
  return (
    <PlaceholderScreen
      title="활동"
      icon="pulse-outline"
      emptyTitle="아직 소식이 없어요"
      emptyDescription={'누가 무엇을 바꿨는지\n시간순으로 모아 보여줍니다.'}
      step="7단계 · 활동 로그"
    />
  );
}
