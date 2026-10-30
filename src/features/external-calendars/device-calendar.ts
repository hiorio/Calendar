import * as Calendar from 'expo-calendar';

import { DEFAULT_CALENDAR_COLOR } from '@/features/calendars/colors';
import { deviceAllDayDateRange, deviceTimezone } from '@/lib/event-time';

import type {
  DeviceCalendarEvent,
  DeviceCalendarInfo,
  DeviceCalendarPermission,
} from './types';

export const deviceCalendarSupported = true;

export async function requestDeviceCalendarAccess(): Promise<DeviceCalendarPermission> {
  const permission = await Calendar.requestCalendarPermissions(false);
  return {
    granted: permission.granted || permission.status === 'granted',
    canAskAgain: permission.canAskAgain,
  };
}

export async function getDeviceCalendarAccess(): Promise<DeviceCalendarPermission> {
  const permission = await Calendar.getCalendarPermissions(false);
  return {
    granted: permission.granted || permission.status === 'granted',
    canAskAgain: permission.canAskAgain,
  };
}

export async function getDeviceCalendars(): Promise<DeviceCalendarInfo[]> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

  return calendars
    .map((calendar) => ({
      id: calendar.id,
      title: calendar.title || '이름 없는 캘린더',
      color: normalizeColor(calendar.color),
      sourceName: calendar.source?.name || '기기 캘린더',
    }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.title.localeCompare(b.title));
}

export async function listDeviceCalendarEvents(
  calendars: DeviceCalendarInfo[],
  start: Date,
  end: Date,
): Promise<DeviceCalendarEvent[]> {
  if (calendars.length === 0) return [];

  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const events = await Calendar.listEvents(
    calendars.map((calendar) => calendar.id),
    start,
    end,
  );
  const localTimezone = deviceTimezone();

  return events.map((event) => {
    const calendar = calendarById.get(event.calendarId);
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    const timezone = event.timeZone || localTimezone;

    if (event.allDay) {
      const { startDate: firstKey, endDate: lastKey } = deviceAllDayDateRange(
        event.startDate,
        event.endDate,
        localTimezone,
      );

      return {
        kind: 'device' as const,
        id: event.id,
        key: `device:${event.id}:${firstKey}`,
        title: event.title || '제목 없는 일정',
        description: event.notes || null,
        location: event.location || null,
        calendarId: event.calendarId,
        calendarName: calendar?.title ?? '기기 캘린더',
        displayColor: calendar?.color ?? DEFAULT_CALENDAR_COLOR,
        is_all_day: true,
        start_at: null,
        end_at: null,
        start_date: firstKey,
        end_date: lastKey,
        timezone,
      };
    }

    return {
      kind: 'device' as const,
      id: event.id,
      key: `device:${event.id}:${startDate.toISOString()}`,
      title: event.title || '제목 없는 일정',
      description: event.notes || null,
      location: event.location || null,
      calendarId: event.calendarId,
      calendarName: calendar?.title ?? '기기 캘린더',
      displayColor: calendar?.color ?? DEFAULT_CALENDAR_COLOR,
      is_all_day: false,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      start_date: null,
      end_date: null,
      timezone,
    };
  });
}

export async function openDeviceCalendarEvent(eventId: string): Promise<void> {
  const event = await Calendar.ExpoCalendarEvent.get(eventId);
  await event.openInCalendar();
}

function normalizeColor(color: string | undefined): string {
  if (!color) return DEFAULT_CALENDAR_COLOR;
  const normalized = color.startsWith('#') ? color : `#${color}`;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : DEFAULT_CALENDAR_COLOR;
}
