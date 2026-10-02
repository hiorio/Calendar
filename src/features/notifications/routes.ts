const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const EVENT_ROUTE = new RegExp(`^(/event/${UUID})(?:\\?occ=([^&]+))?$`);
const CALENDAR_ROUTE = new RegExp(`^/calendar/${UUID}$`);

type NotificationData = Record<string, unknown>;

function isRecord(value: unknown): value is NotificationData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 회차 키만 허용한다. 알림 데이터로 임의 쿼리나 화면을 열 수는 없다. */
function occurrenceKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const canonical = date.toISOString();
  // Date가 2월 30일 등을 다음 달로 보정하는 경우도 거부한다.
  return canonical.slice(0, 19) === value.slice(0, 19) ? canonical : null;
}

function eventRoute(path: string, occurrence: unknown): string {
  const key = occurrenceKey(occurrence);
  return key ? `${path}?occ=${encodeURIComponent(key)}` : path;
}

/**
 * 알림 payload가 앱 안에서 열 수 있는 경로인지 좁게 검증한다.
 * 서버 payload를 그대로 router.push에 넘기면 외부 URL이나 임의 화면을 열 수 있다.
 */
export function notificationRoute(data: unknown): string | null {
  if (!isRecord(data)) return null;

  if (typeof data.url === 'string') {
    const match = EVENT_ROUTE.exec(data.url);
    if (match) {
      let occurrence: unknown = data.original_start;
      if (match[2]) {
        try { occurrence = decodeURIComponent(match[2]); }
        catch { occurrence = null; }
      }
      return eventRoute(match[1], occurrence);
    }
    if (CALENDAR_ROUTE.test(data.url)) return data.url;
  }

  if (typeof data.event_id === 'string' && new RegExp(`^${UUID}$`).test(data.event_id)) {
    return eventRoute(`/event/${data.event_id}`, data.original_start);
  }

  if (typeof data.calendar_id === 'string' && new RegExp(`^${UUID}$`).test(data.calendar_id)) {
    return `/calendar/${data.calendar_id}`;
  }

  return null;
}
