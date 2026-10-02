/** Custom selection is an allow-list: an empty/stale selection must never expose other calendars. */
export function visibleCalendarIds(
  calendars: { id: string }[],
  mode: 'app' | 'all' | 'custom',
  selectedCalendarIds: string[],
  hiddenCalendarIds: string[],
): Set<string> {
  const available = new Set(calendars.map((calendar) => calendar.id));
  if (mode === 'custom') return new Set(selectedCalendarIds.filter((id) => available.has(id)));
  if (mode === 'app') {
    const hidden = new Set(hiddenCalendarIds);
    return new Set([...available].filter((id) => !hidden.has(id)));
  }
  return available;
}

/** Daily entries cover the fetched period; the final entry explicitly expires instead of freezing. */
export function widgetTimelineDates(now: Date, dataEnd: Date, eventEnds: number[]) {
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 32);
  const expiresAt = new Date(Math.min(limit.getTime(), dataEnd.getTime()));
  const dates = new Map<number, Date>([[now.getTime(), now]]);
  for (let day = 1; ; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    if (date >= expiresAt) break;
    dates.set(date.getTime(), date);
  }
  // Refresh the next few ending events without multiplying the full monthly payload indefinitely.
  for (const end of [...new Set(eventEnds)].filter((end) => end > +now && end < +expiresAt)
    .sort((a, b) => a - b).slice(0, 6)) dates.set(end, new Date(end));
  return { dates: [...dates.values()].sort((a, b) => +a - +b), expiresAt };
}
