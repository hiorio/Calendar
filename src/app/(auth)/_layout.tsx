import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/auth-provider';

export default function AuthLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (session) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
