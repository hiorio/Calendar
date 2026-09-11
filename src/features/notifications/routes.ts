const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const EVENT_ROUTE = new RegExp(`^/event/${UUID}$`);
const CALENDAR_ROUTE = new RegExp(`^/calendar/${UUID}$`);

type NotificationData = Record<string, unknown>;

function isRecord(value: unknown): value is NotificationData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 알림 payload가 앱 안에서 열 수 있는 경로인지 좁게 검증한다.
 * 서버 payload를 그대로 router.push에 넘기면 외부 URL이나 임의 화면을 열 수 있다.
 */
export function notificationRoute(data: unknown): string | null {
  if (!isRecord(data)) return null;

  if (
    typeof data.url === 'string' &&
    (EVENT_ROUTE.test(data.url) || CALENDAR_ROUTE.test(data.url))
  ) {
    return data.url;
  }

  if (typeof data.event_id === 'string' && new RegExp(`^${UUID}$`).test(data.event_id)) {
    return `/event/${data.event_id}`;
  }

  if (typeof data.calendar_id === 'string' && new RegExp(`^${UUID}$`).test(data.calendar_id)) {
    return `/calendar/${data.calendar_id}`;
  }

  return null;
}
