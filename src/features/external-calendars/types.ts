import type { EventTimeColumns } from '@/lib/event-time';

export type DeviceCalendarInfo = {
  id: string;
  title: string;
  color: string;
  sourceName: string;
};

export type DeviceCalendarEvent = EventTimeColumns & {
  kind: 'device';
  id: string;
  key: string;
  title: string;
  description: string | null;
  location: string | null;
  calendarId: string;
  calendarName: string;
  displayColor: string;
};

export type DeviceCalendarPermission = {
  granted: boolean;
  canAskAgain: boolean;
};
