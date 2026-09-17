export type JsonRecord = Record<string, unknown>;

export type OutboxJob = {
  id: number;
  user_id: string;
  type: string;
  payload: JsonRecord;
  attempts: number;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: JsonRecord;
  sound: 'default';
  channelId: 'default';
};

function text(payload: JsonRecord, key: string, fallback = '') {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function route(payload: JsonRecord) {
  const eventId = text(payload, 'event_id');
  if (eventId) return `/event/${eventId}`;

  const calendarId = text(payload, 'calendar_id');
  return calendarId ? `/calendar/${calendarId}` : '/';
}

export function buildPushMessage(job: OutboxJob, expoToken: string): ExpoPushMessage {
  const payload = job.payload ?? {};
  const eventTitle = text(payload, 'title', '일정');
  const calendarName = text(payload, 'calendar_name', '공유 캘린더');

  let title = calendarName;
  let body = eventTitle;

  switch (job.type) {
    case 'EVENT_CREATED':
      title = `${calendarName}에 새 일정`;
      break;
    case 'EVENT_UPDATED':
      title = `${calendarName} 일정 변경`;
      break;
    case 'EVENT_DELETED':
      title = `${calendarName} 일정 삭제`;
      break;
    case 'COMMENT':
      title = `${eventTitle}에 새 댓글`;
      body = text(payload, 'excerpt', '새 댓글을 확인해 주세요.');
      break;
    case 'REMINDER':
      title = '일정 알림';
      body = eventTitle;
      break;
  }

  return {
    to: expoToken,
    title: truncate(title, 100),
    body: truncate(body, 180),
    data: {
      ...payload,
      url: route(payload),
      outbox_id: job.id,
    },
    sound: 'default',
    channelId: 'default',
  };
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function retryDelaySeconds(attempt: number) {
  return Math.min(300, 15 * 2 ** Math.max(0, attempt - 1));
}

export function expoErrorCode(value: unknown) {
  if (typeof value !== 'object' || value === null) return null;
  const details = (value as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return null;
  const error = (details as { error?: unknown }).error;
  return typeof error === 'string' ? error : null;
}
