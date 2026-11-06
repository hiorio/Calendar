import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { buildMonthMatrix, formatDayTitle, formatMonthTitle, toDateKey, weekdayLabels } from '@/lib/date';

import type { LockScreenBoardSnapshot, WallpaperDayItem } from './types';

function alpha(hex: string, opacity: number) {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const value = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${normalized}${value}`;
}

function weekDates(now: Date, weekStart: 'sunday' | 'monday') {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstWeekday = weekStart === 'monday' ? 1 : 0;
  start.setDate(start.getDate() - ((start.getDay() - firstWeekday + 7) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function LockScreenBoardPreview({
  snapshot,
  backgroundUri,
  backgroundRevision = 0,
  now = new Date(),
}: {
  snapshot: LockScreenBoardSnapshot;
  backgroundUri: string | null;
  backgroundRevision?: number;
  now?: Date;
}) {
  const { palette } = snapshot;
  const dayMap = new Map(snapshot.days.map((day) => [day.key, day]));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${snapshot.layout === 'agenda' ? '오늘' : '월간'} 잠금화면 보드 미리보기`}
      style={[
        styles.phone,
        { backgroundColor: palette.background, borderColor: alpha(palette.text, 0.16) },
      ]}>
      {backgroundUri ? (
        <Image
          source={{ uri: backgroundUri }}
          contentFit="cover"
          cachePolicy="none"
          recyclingKey={`${backgroundUri}:${backgroundRevision}`}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          <View
            style={[
              styles.glowTop,
              { backgroundColor: alpha(palette.accent, 0.32) },
            ]}
          />
          <View
            style={[
              styles.glowBottom,
              { backgroundColor: alpha(palette.backgroundAlt, 0.82) },
            ]}
          />
        </>
      )}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: alpha(palette.background, backgroundUri ? 0.38 : 0.08) }]}
      />

      <View style={[styles.clockArea, snapshot.layout === 'month' && styles.monthClockArea]}>
        <Text allowFontScaling={false} style={[styles.date, { color: alpha(palette.text, 0.88) }]}>
          {new Intl.DateTimeFormat('ko-KR', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          }).format(now)}
        </Text>
        <Text allowFontScaling={false} style={[styles.clock, { color: alpha(palette.text, 0.92) }]}>
          09:41
        </Text>
      </View>

      <View style={[styles.board, snapshot.layout === 'month' && styles.monthBoard]}>
        {snapshot.layout === 'agenda' ? (
          <AgendaBoard snapshot={snapshot} dayMap={dayMap} now={now} />
        ) : (
          <MonthBoard snapshot={snapshot} dayMap={dayMap} now={now} />
        )}
      </View>
    </View>
  );
}

function AgendaBoard({
  snapshot,
  dayMap,
  now,
}: {
  snapshot: LockScreenBoardSnapshot;
  dayMap: Map<string, WallpaperDayItem>;
  now: Date;
}) {
  const { palette } = snapshot;
  const todayKey = toDateKey(now);
  const today = dayMap.get(todayKey);
  const week = weekDates(now, snapshot.weekStart);
  const labels = weekdayLabels(snapshot.weekStart);
  const events = today?.events ?? [];

  return (
    <>
      <View style={[styles.previewCard, styles.weekCard, { backgroundColor: alpha(palette.card, 0.88) }]}>
        <View style={styles.weekRow}>
          {week.map((date, index) => {
            const key = toDateKey(date);
            const count = dayMap.get(key)?.eventCount ?? 0;
            const selected = key === todayKey;
            return (
              <View key={key} style={styles.weekDay}>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.weekday,
                    {
                      color:
                        date.getDay() === 0
                          ? palette.sunday
                          : date.getDay() === 6
                            ? palette.saturday
                            : palette.textSecondary,
                    },
                  ]}>
                  {labels[index]}
                </Text>
                <View
                  style={[
                    styles.dayNumber,
                    selected && { backgroundColor: palette.accent },
                  ]}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.dayNumberText,
                      { color: selected ? palette.onAccent : palette.text },
                    ]}>
                    {date.getDate()}
                  </Text>
                </View>
                <View style={styles.dayDots}>
                  {Array.from({ length: Math.min(3, count) }, (_, dot) => (
                    <View
                      key={dot}
                      style={[styles.dayDot, { backgroundColor: palette.accent }]}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.previewCard, styles.agendaCard, { backgroundColor: alpha(palette.card, 0.9) }]}>
        <View style={styles.cardHeading}>
          <View>
            <Text allowFontScaling={false} style={[styles.cardTitle, { color: palette.text }]}>
              {formatDayTitle(now)}
            </Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: palette.accent }]}>
            <Text allowFontScaling={false} style={[styles.countText, { color: palette.onAccent }]}>
              {(today?.eventCount ?? 0) + snapshot.memos.length}
            </Text>
          </View>
        </View>

        <View style={styles.agendaList}>
          {events.length ? (
            events.slice(0, snapshot.showMemos ? 5 : 8).map((event) => (
              <View key={event.key} style={styles.agendaRow}>
                <Text allowFontScaling={false} style={[styles.time, { color: palette.textSecondary }]}>
                  {event.timeLabel}
                </Text>
                <View style={[styles.eventLine, { backgroundColor: event.color }]} />
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[styles.eventTitle, { color: palette.text }]}>
                  {event.title}
                </Text>
              </View>
            ))
          ) : (
            <Text allowFontScaling={false} style={[styles.emptyText, { color: palette.textSecondary }]}>
              오늘 예정된 일정이 없어요
            </Text>
          )}
        </View>

        {snapshot.showMemos && snapshot.memos.length ? (
          <View style={[styles.memoArea, { borderTopColor: alpha(palette.text, 0.12) }]}>
            {snapshot.memos.slice(0, Math.max(2, 6 - events.length)).map((memo) => (
              <View key={memo.id} style={styles.memoRow}>
                <View style={[styles.memoCircle, { borderColor: memo.color }]} />
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[styles.memoText, { color: palette.text }]}>
                  {memo.content}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

function MonthBoard({
  snapshot,
  dayMap,
  now,
}: {
  snapshot: LockScreenBoardSnapshot;
  dayMap: Map<string, WallpaperDayItem>;
  now: Date;
}) {
  const { palette } = snapshot;
  const weeks = buildMonthMatrix(now, snapshot.weekStart);
  const labels = weekdayLabels(snapshot.weekStart);
  const todayKey = toDateKey(now);
  const today = dayMap.get(todayKey);

  return (
    <>
      <View style={[styles.previewCard, styles.monthCard, { backgroundColor: alpha(palette.card, 0.9) }]}>
        <View style={styles.cardHeading}>
          <Text allowFontScaling={false} style={[styles.cardTitle, { color: palette.text }]}>
            {formatMonthTitle(now)}
          </Text>
        </View>
        <View style={styles.monthWeek}>
          {labels.map((label, index) => (
            <Text
              key={label}
              allowFontScaling={false}
              style={[
                styles.monthWeekday,
                {
                  color:
                    (snapshot.weekStart === 'sunday' ? index : (index + 1) % 7) === 0
                      ? palette.sunday
                      : (snapshot.weekStart === 'sunday' ? index : (index + 1) % 7) === 6
                        ? palette.saturday
                        : palette.textSecondary,
                },
              ]}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.monthGrid}>
          {weeks.flat().map((date) => {
            const key = toDateKey(date);
            const day = dayMap.get(key);
            const firstEvent = day?.events[0];
            const inMonth = date.getMonth() === now.getMonth();
            const selected = key === todayKey;
            return (
              <View key={key} style={styles.monthDay}>
                <View style={[styles.monthNumberCircle, selected && { backgroundColor: palette.accent }]}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.monthNumber,
                      {
                        color: selected
                          ? palette.onAccent
                          : alpha(palette.text, inMonth ? 1 : 0.35),
                      },
                    ]}>
                    {date.getDate()}
                  </Text>
                </View>
                {firstEvent ? (
                  <View style={[styles.monthEvent, { backgroundColor: alpha(firstEvent.color, 0.62) }]} />
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.previewCard, styles.monthTodayCard, { backgroundColor: alpha(palette.card, 0.9) }]}>
        <View style={styles.cardHeading}>
          <Text allowFontScaling={false} style={[styles.cardTitle, { color: palette.text }]}>
            {formatDayTitle(now)}
          </Text>
          <View style={[styles.countPill, { backgroundColor: palette.accent }]}>
            <Text allowFontScaling={false} style={[styles.countText, { color: palette.onAccent }]}>
              {today?.eventCount ?? 0}
            </Text>
          </View>
        </View>
        <View style={styles.agendaList}>
          {today?.events.length ? (
            today.events.slice(0, 3).map((event) => (
              <View key={event.key} style={styles.agendaRow}>
                <Text allowFontScaling={false} style={[styles.time, { color: palette.textSecondary }]}>
                  {event.timeLabel}
                </Text>
                <View style={[styles.eventLine, { backgroundColor: event.color }]} />
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.eventTitle, { color: palette.text }]}>
                  {event.title}
                </Text>
              </View>
            ))
          ) : (
            <Text allowFontScaling={false} style={[styles.emptyText, { color: palette.textSecondary }]}>
              오늘 예정된 일정이 없어요
            </Text>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  phone: {
    width: 286,
    aspectRatio: 9 / 19.5,
    alignSelf: 'center',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: -55,
    right: -34,
    width: 210,
    height: 210,
    borderRadius: Radius.pill,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -40,
    left: -60,
    width: 230,
    height: 230,
    borderRadius: Radius.pill,
  },
  clockArea: { height: '36.5%', alignItems: 'center', paddingTop: 32 },
  monthClockArea: { height: '28%' },
  date: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  clock: { fontSize: 58, lineHeight: 66, fontWeight: '300', letterSpacing: -2 },
  board: { flex: 1, gap: 8, paddingHorizontal: 12, paddingBottom: 54 },
  monthBoard: { paddingBottom: 102 },
  previewCard: { borderRadius: 15, padding: 12 },
  weekCard: { paddingVertical: 9 },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, alignItems: 'center', gap: 2 },
  weekday: { fontSize: 7, lineHeight: 9, fontWeight: '600' },
  dayNumber: {
    width: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  dayNumberText: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
  dayDots: { height: 3, flexDirection: 'row', gap: 2 },
  dayDot: { width: 3, height: 3, borderRadius: Radius.pill },
  agendaCard: { flex: 1, minHeight: 218 },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  countPill: {
    minWidth: 23,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 9, fontWeight: '700' },
  agendaList: { marginTop: 9, gap: 6 },
  agendaRow: { minHeight: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { width: 43, textAlign: 'right', fontSize: 7, lineHeight: 10, fontWeight: '500' },
  eventLine: { width: 3, alignSelf: 'stretch', borderRadius: Radius.pill },
  eventTitle: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '600' },
  emptyText: { paddingVertical: 18, textAlign: 'center', fontSize: 9, lineHeight: 12 },
  memoArea: {
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  memoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memoCircle: { width: 7, height: 7, borderRadius: Radius.pill, borderWidth: 1 },
  memoText: { flex: 1, fontSize: 8, lineHeight: 11, fontWeight: '500' },
  monthCard: { flex: 1 },
  monthTodayCard: { height: 88 },
  monthWeek: { flexDirection: 'row', marginTop: 8 },
  monthWeekday: { flex: 1, textAlign: 'center', fontSize: 8, lineHeight: 11, fontWeight: '600' },
  monthGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  monthDay: { width: `${100 / 7}%`, height: `${100 / 6}%`, alignItems: 'center', paddingTop: 2 },
  monthNumberCircle: {
    width: 21,
    height: 21,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNumber: { fontSize: 9, lineHeight: 11, fontWeight: '600' },
  monthEvent: { width: 24, height: 4, marginTop: 1, borderRadius: Radius.pill },
});
