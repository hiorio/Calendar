import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useProfile } from '@/features/profile/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * 1단계 홈. 월간 뷰는 3단계에서 붙는다.
 * 지금은 로그인 → 프로필 → RLS 통과 조회까지가 실제로 도는지 확인하는 화면이다.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const profile = useProfile();

  const calendars = useQuery({
    queryKey: ['calendars', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendars')
        .select('id, name, color')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {profile.isPending ? (
          <ActivityIndicator color={theme.tint} />
        ) : (
          <ThemedText type="subtitle">
            {profile.data ? `안녕하세요, ${profile.data.nickname}님` : '홈'}
          </ThemedText>
        )}

        {calendars.isError ? (
          <ThemedText themeColor="danger">
            캘린더를 불러오지 못했습니다: {(calendars.error as Error).message}
          </ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">
            참여 중인 캘린더 {calendars.data?.length ?? 0}개
          </ThemedText>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          캘린더 생성과 초대는 2단계, 월간 뷰와 일정 CRUD는 3단계입니다.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  note: { textAlign: 'center' },
});
