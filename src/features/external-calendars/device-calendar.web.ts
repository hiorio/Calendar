import type {
  DeviceCalendarEvent,
  DeviceCalendarInfo,
  DeviceCalendarPermission,
} from './types';

export const deviceCalendarSupported = false;

export async function requestDeviceCalendarAccess(): Promise<DeviceCalendarPermission> {
  return { granted: false, canAskAgain: false };
}

export async function getDeviceCalendarAccess(): Promise<DeviceCalendarPermission> {
  return { granted: false, canAskAgain: false };
}

export async function getDeviceCalendars(): Promise<DeviceCalendarInfo[]> {
  return [];
}

export async function listDeviceCalendarEvents(
  _calendars: DeviceCalendarInfo[],
  _start: Date,
  _end: Date,
): Promise<DeviceCalendarEvent[]> {
  return [];
}

export async function openDeviceCalendarEvent(_eventId: string): Promise<void> {}
