import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { notificationRoute } from '@/features/notifications/routes';

const handledResponses = new Set<string>();

function openNotification(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;

  const identifier = response.notification.request.identifier;
  if (handledResponses.has(identifier)) return;

  const path = notificationRoute(response.notification.request.content.data);
  if (!path) return;

  handledResponses.add(identifier);
  router.push(path as Href);
}

export function useNotificationNavigation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    openNotification(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, [enabled]);
}
