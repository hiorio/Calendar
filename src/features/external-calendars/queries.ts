import { useQuery } from '@tanstack/react-query';

import {
  deviceCalendarSupported,
  getDeviceCalendarAccess,
  getDeviceCalendars,
  listDeviceCalendarEvents,
} from './device-calendar';
import type { DeviceCalendarEvent, DeviceCalendarInfo } from './types';
import { useDeviceCalendarPreference } from '@/stores/device-calendar-preference';

export const deviceCalendarKeys = {
  all: ['device-calendars'] as const,
  list: () => ['device-calendars', 'list'] as const,
  events: (ids: string[], start: string, end: string) =>
    ['device-calendars', 'events', ids, start, end] as const,
};

export function useDeviceCalendars() {
  const connected = useDeviceCalendarPreference((state) => state.connected);

  return useQuery<DeviceCalendarInfo[]>({
    queryKey: deviceCalendarKeys.list(),
    enabled: deviceCalendarSupported && connected,
    queryFn: async () => {
      const permission = await getDeviceCalendarAccess();
      if (!permission.granted) throw new Error('기기 설정에서 캘린더 접근을 허용해 주세요.');
      return getDeviceCalendars();
    },
  });
}

export function useDeviceCalendarEvents(start: Date, end: Date) {
  const connected = useDeviceCalendarPreference((state) => state.connected);
  const selectedIds = useDeviceCalendarPreference((state) => state.selectedIds);
  const calendars = useDeviceCalendars();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const sortedIds = [...selectedIds].sort();

  return useQuery<DeviceCalendarEvent[]>({
    queryKey: deviceCalendarKeys.events(sortedIds, startIso, endIso),
    enabled:
      deviceCalendarSupported &&
      connected &&
      sortedIds.length > 0 &&
      Boolean(calendars.data),
    queryFn: () =>
      listDeviceCalendarEvents(
        (calendars.data ?? []).filter((calendar) => sortedIds.includes(calendar.id)),
        start,
        end,
      ),
  });
}
