import { createWidget } from 'expo-widgets';
import {
  Button,
  HStack,
  Image,
  Link,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  containerBackground,
  containerRelativeFrame,
  contentShape,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  lineLimit,
  minimumScaleFactor,
  offset,
  padding,
  privacySensitive,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

import type { TimeFlowerWidgetProps } from './types';

export const CalendarWidget = createWidget<TimeFlowerWidgetProps>(
  'TimeFlowerCalendar',
  (props, environment) => {
    'widget';

    const firstStoredWeek = props.monthWeeks?.[0];
    const hasCalendarPayload =
      props.layoutRevision === 2 &&
      !!props.palettes?.light &&
      !!props.palettes?.dark &&
      Array.isArray(props.events) &&
      Array.isArray(props.monthWeeks) &&
      Array.isArray(props.weekdayLabels) &&
      typeof props.preferredScheme === 'string' &&
      typeof props.calendarUrl === 'string' &&
      typeof props.dateTitle === 'string' &&
      typeof props.weekdayTitle === 'string' &&
      typeof props.dayNumber === 'string' &&
      typeof props.monthShortTitle === 'string' &&
      (!firstStoredWeek || Array.isArray(firstStoredWeek.days));
    if (!hasCalendarPayload || props.expired) {
      // Placeholder and expired timelines still show a real month in the large family.
      // Widget functions are serialized: this calculation must remain inside the function.
      const now = environment.date ?? new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const gridStart = 1 - monthStart.getDay();
      const large = environment.widgetFamily === 'systemLarge' || environment.widgetFamily === 'systemExtraLarge';
      return (
        <VStack spacing={large ? 8 : 2} modifiers={[containerBackground('clear', 'widget')]}>
          <Text modifiers={[font({ size: 18, weight: 'bold' })]}>
            {large ? `${now.getFullYear()}년 ${now.getMonth() + 1}월` : props.expired ? '캘린더 업데이트 필요' : 'TimeFlower'}
          </Text>
          {large ? (
            <VStack spacing={8}>
              <HStack spacing={3}>
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <Text key={day} modifiers={[font({ size: 10 }), frame({ maxWidth: 1000 })]}>{day}</Text>
                ))}
              </HStack>
              {Array.from({ length: 6 }, (_, week) => (
                <HStack key={week} spacing={3}>
                  {Array.from({ length: 7 }, (_, day) => {
                    const date = new Date(now.getFullYear(), now.getMonth(), gridStart + week * 7 + day);
                    return <Text key={day} modifiers={[
                      font({ size: 13, weight: date.getDate() === now.getDate() && date.getMonth() === now.getMonth() ? 'bold' : 'regular' }),
                      frame({ maxWidth: 1000, height: 22 }),
                    ]}>{date.getMonth() === now.getMonth() ? date.getDate() : ' '}</Text>;
                  })}
                </HStack>
              ))}
            </VStack>
          ) : null}
          <Text modifiers={[font({ size: 10, weight: 'medium' }), lineLimit(2)]}>
            앱을 열어 일정을 불러오세요
          </Text>
        </VStack>
      );
    }

    const requestedScheme = props.preferredScheme;
    const scheme = requestedScheme === 'system' ? (environment.colorScheme ?? 'light') : requestedScheme;
    const colors = props.palettes[scheme];
    const baseMonthKey = typeof props.monthKey === 'string' ? props.monthKey : '';
    const baseMonthPage = {
      key: baseMonthKey,
      title: props.monthTitle,
      shortTitle: props.monthShortTitle,
      weeks: props.monthWeeks,
    };
    const monthPages = [
      ...(Array.isArray(props.adjacentMonthPages) ? props.adjacentMonthPages : []),
      baseMonthPage,
    ].filter((page) => Array.isArray(page.weeks)).sort((a, b) => a.key.localeCompare(b.key));
    const requestedMonthKey = typeof props.selectedMonthKey === 'string'
      ? props.selectedMonthKey
      : baseMonthKey;
    const selectedMonthIndex = monthPages.findIndex((page) => page.key === requestedMonthKey);
    const effectiveMonthIndex = selectedMonthIndex >= 0
      ? selectedMonthIndex
      : Math.max(0, monthPages.findIndex((page) => page.key === baseMonthKey));
    const selectedMonthPage = monthPages[effectiveMonthIndex] ?? baseMonthPage;
    const previousMonthPage = effectiveMonthIndex > 0
      ? monthPages[effectiveMonthIndex - 1]
      : null;
    const nextMonthPage = effectiveMonthIndex < monthPages.length - 1
      ? monthPages[effectiveMonthIndex + 1]
      : null;
    const todayMonthPage = monthPages.find((page) => page.key === props.todayMonthKey) ?? null;
    const upcoming = props.events.filter((event) => event.endAt > environment.date.getTime());
    const first = upcoming[0];
    const rootModifiers = [
      containerBackground(colors.background, 'widget'),
      widgetURL(props.calendarUrl),
      foregroundStyle(colors.text),
    ];
    // iPhone SE의 WidgetKit 기본 margin 안에도 7열이 들어가는 안전 폭이다.
    const dayWidth = 34;
    const columnGap = 3;
    const calendarWidth = dayWidth * 7 + columnGap * 6;
    const currentWeekIndex = props.monthWeeks.findIndex((week) =>
      week.days.some((day) => day.isToday),
    );
    const currentWeek =
      currentWeekIndex >= 0 ? props.monthWeeks[currentWeekIndex] : props.monthWeeks[0];
    const currentDays = currentWeek?.days ?? [];
    const currentLanes = currentWeek?.lanes ?? [];
    const today = currentDays.find((day) => day.isToday);

    if (environment.widgetFamily === 'accessoryInline') {
      return (
        <Text modifiers={[lineLimit(1), privacySensitive()]}>
          {first ? `${first.timeLabel} ${first.title}` : `${props.dayNumber}일 · 예정 없음`}
        </Text>
      );
    }

    if (environment.widgetFamily === 'accessoryCircular') {
      return (
        <VStack spacing={0} modifiers={rootModifiers}>
          <Text modifiers={[font({ size: 20, weight: 'bold' })]}>{props.dayNumber}</Text>
          <Text modifiers={[font({ size: 10, weight: 'medium' }), lineLimit(1)]}>
            {props.upcomingEventCount > 0 ? `${props.upcomingEventCount}개` : '비었음'}
          </Text>
        </VStack>
      );
    }

    if (environment.widgetFamily === 'accessoryRectangular') {
      return (
        <VStack alignment="leading" spacing={2} modifiers={rootModifiers}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1)]}>
            {props.dateTitle}
          </Text>
          <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1), privacySensitive()]}>
            {first?.title ?? '예정된 일정이 없어요'}
          </Text>
          {first ? (
            <Text modifiers={[font({ size: 10 }), lineLimit(1), privacySensitive()]}>
              {first.timeLabel} · {first.calendarName}
            </Text>
          ) : null}
        </VStack>
      );
    }

    if (environment.widgetFamily === 'systemLarge' || environment.widgetFamily === 'systemExtraLarge') {
      // iOS 17+ uses the real widget container width, not a 256pt miniature calendar.
      // The width fallback is used only by older WidgetKit versions.
      const responsive = environment.widgetContentMargins != null;
      const columnFrame = (span = 1) => responsive
        ? containerRelativeFrame({ axes: 'horizontal', count: 7, span, spacing: columnGap })
        : frame({ width: span * dayWidth + (span - 1) * columnGap });
      const fullWidth = responsive
        ? containerRelativeFrame({ axes: 'horizontal' })
        : frame({ width: calendarWidth });
      const largeDayHeaderHeight = 16;
      const largeLaneHeight = 9;
      const largeVisibleLaneCount = 2;
      const largeOverflowHeight = 8;
      const headerHorizontalInset = 10;
      const headerControlSize = 28;
      const headerControlRadius = headerControlSize / 2;
      const largeWeekHeight =
        largeDayHeaderHeight + largeLaneHeight * largeVisibleLaneCount + largeOverflowHeight;
      return (
        <VStack alignment="leading" spacing={4} modifiers={[...rootModifiers, fullWidth, frame({ maxHeight: 1000 })]}>
          <HStack
            alignment="center"
            spacing={5}
            modifiers={[padding({ horizontal: headerHorizontalInset }), fullWidth]}>
            <Text modifiers={[font({ size: 18, weight: 'bold' }), lineLimit(1)]}>{selectedMonthPage.title}</Text>
            <Spacer />
            {responsive ? (
              previousMonthPage ? (
                <Button
                  label="이전 달"
                  systemImage="chevron.left"
                  target="calendar.previous-month"
                  onPress={() => ({ selectedMonthKey: previousMonthPage.key })}
                  modifiers={[
                    buttonStyle('plain'),
                    labelStyle('iconOnly'),
                    font({ size: 12, weight: 'bold' }),
                    foregroundStyle(colors.accent),
                    frame({ width: headerControlSize, height: headerControlSize }),
                    background(colors.accentSoft),
                    cornerRadius(headerControlRadius),
                  ]}
                />
              ) : (
                <Image
                  systemName="chevron.left"
                  size={12}
                  color={colors.textTertiary}
                  modifiers={[
                    frame({ width: headerControlSize, height: headerControlSize }),
                    background(colors.accentSoft),
                    cornerRadius(headerControlRadius),
                  ]}
                />
              )
            ) : null}
            {responsive && todayMonthPage ? (
              <Button
                label="오늘"
                target="calendar.today"
                onPress={() => ({ selectedMonthKey: todayMonthPage.key })}
                modifiers={[
                  buttonStyle('plain'),
                  font({ size: 10, weight: 'bold' }),
                  foregroundStyle(colors.accent),
                  frame({ width: 44, height: headerControlSize }),
                  background(colors.accentSoft),
                  cornerRadius(headerControlRadius),
                ]}
              />
            ) : null}
            {responsive ? (
              nextMonthPage ? (
                <Button
                  label="다음 달"
                  systemImage="chevron.right"
                  target="calendar.next-month"
                  onPress={() => ({ selectedMonthKey: nextMonthPage.key })}
                  modifiers={[
                    buttonStyle('plain'),
                    labelStyle('iconOnly'),
                    font({ size: 12, weight: 'bold' }),
                    foregroundStyle(colors.accent),
                    frame({ width: headerControlSize, height: headerControlSize }),
                    background(colors.accentSoft),
                    cornerRadius(headerControlRadius),
                  ]}
                />
              ) : (
                <Image
                  systemName="chevron.right"
                  size={12}
                  color={colors.textTertiary}
                  modifiers={[
                    frame({ width: headerControlSize, height: headerControlSize }),
                    background(colors.accentSoft),
                    cornerRadius(headerControlRadius),
                  ]}
                />
              )
            ) : null}
            {props.showQuickActions ? (
              <Link destination={props.quickEventUrl}>
                <Image
                  systemName="plus"
                  size={15}
                  color={colors.onAccent}
                  modifiers={[
                    frame({ width: headerControlSize, height: headerControlSize }),
                    background(colors.accent),
                    cornerRadius(headerControlRadius),
                  ]}
                />
              </Link>
            ) : null}
          </HStack>
          <HStack spacing={columnGap}>
            {props.weekdayLabels.map((weekday) => (
              <Text key={weekday} modifiers={[
                font({ size: 9, weight: 'semibold' }),
                foregroundStyle(weekday === '일' ? colors.sunday : weekday === '토' ? colors.saturday : colors.textTertiary),
                frame({ height: 10 }), columnFrame(),
              ]}>{weekday}</Text>
            ))}
          </HStack>
          {/* Native DynamicView supports stacks, but not Grid. Keep all six weeks, including month edges. */}
          <VStack alignment="leading" spacing={0} modifiers={[fullWidth, frame({ maxHeight: 1000 })]}>
            {selectedMonthPage.weeks.map((week, weekIndex) => (
              <VStack key={week.key} alignment="leading" spacing={0} modifiers={[frame({ maxHeight: 1000 })]}>
                <ZStack
                  alignment="topLeading"
                  modifiers={[fullWidth, frame({ height: largeWeekHeight, alignment: 'topLeading' })]}>
                  <HStack spacing={columnGap}>
                    {week.days.map((day) => (
                      <Link key={day.key} destination={day.url}>
                        <VStack
                          spacing={0}
                          modifiers={[
                            columnFrame(),
                            frame({ height: largeWeekHeight, alignment: 'top' }),
                            contentShape(shapes.rectangle()),
                          ]}>
                          <Text modifiers={[
                            font({ size: 11, weight: day.isToday ? 'bold' : 'semibold' }),
                            foregroundStyle(day.isToday ? colors.onAccent : !day.inMonth ? colors.textTertiary
                              : day.weekday === 0 ? colors.sunday : day.weekday === 6 ? colors.saturday : colors.text),
                            frame({ width: 18, height: largeDayHeaderHeight }),
                            ...(day.isToday ? [background(colors.accent), cornerRadius(8)] : []),
                          ]}>{day.number}</Text>
                        </VStack>
                      </Link>
                    ))}
                  </HStack>
                  <VStack
                    alignment="leading"
                    spacing={0}
                    modifiers={[fullWidth, offset({ y: largeDayHeaderHeight })]}>
                    {week.lanes.slice(0, largeVisibleLaneCount).map((lane, laneIndex) => {
                      // Fill gaps with spans as well: event bars and date columns share the same width formula.
                      const segments = [];
                      let cursor = 0;
                      for (const event of [...lane].sort((a, b) => a.startColumn - b.startColumn)) {
                        if (event.startColumn > cursor) segments.push({ key: `gap-${cursor}`, span: event.startColumn - cursor, event: null });
                        segments.push({ key: event.key, span: event.endColumn - event.startColumn + 1, event });
                        cursor = event.endColumn + 1;
                      }
                      if (cursor < 7) segments.push({ key: `gap-${cursor}`, span: 7 - cursor, event: null });
                      return (
                        <HStack key={`${week.key}-lane-${laneIndex}`} spacing={columnGap} modifiers={[frame({ height: largeLaneHeight })]}>
                          {segments.map(({ key, span, event }) => event ? (
                            <Link key={key} destination={event.url}>
                              <Text modifiers={[
                                font({ size: 7, weight: 'semibold' }),
                                foregroundStyle(event.filled ? event.textColors[scheme] : event.colors[scheme]),
                                lineLimit(1), minimumScaleFactor(0.8), padding({ horizontal: 2 }),
                                frame({ height: largeLaneHeight, alignment: 'leading' }), columnFrame(span),
                                ...(event.filled ? [background(event.colors[scheme]), cornerRadius(3)] : []),
                                privacySensitive(),
                              ]}>{event.title}</Text>
                            </Link>
                          ) : <Text key={key} modifiers={[columnFrame(span), frame({ height: largeLaneHeight })]}>{' '}</Text>)}
                        </HStack>
                      );
                    })}
                    <HStack spacing={columnGap} modifiers={[frame({ height: largeOverflowHeight })]}>
                      {week.days.map((day) => day.hiddenEventCount > 0 ? (
                        <Link key={`${day.key}-overflow`} destination={day.url}>
                          <Text modifiers={[
                            font({ size: 7, weight: 'semibold' }),
                            foregroundStyle(colors.textSecondary),
                            frame({ height: largeOverflowHeight, alignment: 'leading' }),
                            columnFrame(),
                            privacySensitive(),
                          ]}>{`+${day.hiddenEventCount}`}</Text>
                        </Link>
                      ) : (
                        <Text
                          key={`${day.key}-overflow-empty`}
                          modifiers={[columnFrame(), frame({ height: largeOverflowHeight })]}>
                          {' '}
                        </Text>
                      ))}
                    </HStack>
                  </VStack>
                </ZStack>
                {weekIndex < selectedMonthPage.weeks.length - 1 ? (
                  <RoundedRectangle cornerRadius={0.5} modifiers={[fullWidth, frame({ height: 1 }), foregroundStyle(colors.border)]} />
                ) : null}
              </VStack>
            ))}
          </VStack>
        </VStack>
      );
    }

    if (environment.widgetFamily === 'systemMedium') {
      return (
        <VStack alignment="leading" spacing={3} modifiers={rootModifiers}>
          <HStack alignment="center" spacing={6} modifiers={[frame({ width: calendarWidth })]}>
            <Text modifiers={[font({ size: 17, weight: 'bold' }), lineLimit(1)]}>
              {props.monthShortTitle}
            </Text>
            <Spacer />
            {props.showQuickActions ? (
              <Link destination={props.quickEventUrl}>
                <Image systemName="plus" size={17} color={colors.accent} />
              </Link>
            ) : null}
          </HStack>

          <HStack spacing={columnGap}>
            {props.weekdayLabels.map((weekday) => (
              <Text
                key={weekday}
                modifiers={[
                  font({ size: 8, weight: 'medium' }),
                  foregroundStyle(colors.textTertiary),
                  frame({ width: dayWidth, height: 10 }),
                ]}>
                {weekday}
              </Text>
            ))}
          </HStack>

          <RoundedRectangle
            cornerRadius={0.5}
            modifiers={[
              frame({ width: calendarWidth, height: 1 }),
              foregroundStyle(colors.border),
            ]}
          />

          <HStack spacing={columnGap}>
            {currentDays.map((day) => (
              <Link key={day.key} destination={day.url}>
                <VStack spacing={0} modifiers={[frame({ width: dayWidth, height: 18 })]}>
                  <Text
                    modifiers={[
                      font({ size: 11, weight: day.isToday ? 'bold' : 'semibold' }),
                      foregroundStyle(
                        day.isToday
                          ? colors.onAccent
                          : !day.inMonth
                            ? colors.textTertiary
                            : day.weekday === 0
                              ? colors.sunday
                              : day.weekday === 6
                                ? colors.saturday
                                : colors.text,
                      ),
                      frame({ width: 18, height: 18 }),
                      ...(day.isToday ? [background(colors.accent), cornerRadius(9)] : []),
                    ]}>
                    {day.number}
                  </Text>
                </VStack>
              </Link>
            ))}
          </HStack>

          <VStack alignment="leading" spacing={2}>
            {currentLanes.slice(0, 3).map((lane, laneIndex) => (
              <ZStack
                key={`${currentWeek?.key ?? 'current'}-medium-lane-${laneIndex}`}
                alignment="leading"
                modifiers={[frame({ width: calendarWidth, height: 10, alignment: 'leading' })]}>
                {lane.map((event) => {
                  const eventWidth =
                    (event.endColumn - event.startColumn + 1) * dayWidth +
                    (event.endColumn - event.startColumn) * columnGap;
                  const eventOffset = event.startColumn * (dayWidth + columnGap);
                  return (
                    <Link
                      key={event.key}
                      destination={event.url}
                      modifiers={[offset({ x: eventOffset + 1 })]}>
                      <Text
                        modifiers={[
                          font({ size: 7, weight: 'semibold' }),
                          foregroundStyle(event.textColors[scheme]),
                          lineLimit(1),
                          minimumScaleFactor(0.75),
                          padding({ horizontal: 2 }),
                          frame({ width: eventWidth - 2, height: 10, alignment: 'leading' }),
                          background(event.colors[scheme]),
                          cornerRadius(3),
                          privacySensitive(),
                        ]}>
                        {event.title}
                      </Text>
                    </Link>
                  );
                })}
              </ZStack>
            ))}
          </VStack>
        </VStack>
      );
    }

    const todayEvent = today?.events[0];
    return (
      <VStack
        alignment="leading"
        spacing={1}
        modifiers={[
          containerBackground(colors.background, 'widget'),
          widgetURL(today?.url ?? props.calendarUrl),
          foregroundStyle(colors.text),
        ]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {props.weekdayTitle}
        </Text>
        <Text modifiers={[font({ size: 40, weight: 'bold' }), minimumScaleFactor(0.8)]}>
          {props.dayNumber}
        </Text>
        <Spacer minLength={8} />
        <Text
          modifiers={[
            font({ size: 14, weight: todayEvent ? 'semibold' : 'medium' }),
            foregroundStyle(todayEvent ? colors.text : colors.textSecondary),
            lineLimit(2),
            ...(todayEvent ? [privacySensitive()] : []),
          ]}>
          {todayEvent?.title ?? '오늘 일정 없음'}
        </Text>
        {today && today.eventCount > 1 ? (
          <Text
            modifiers={[
              font({ size: 10 }),
              foregroundStyle(colors.textSecondary),
              lineLimit(1),
              privacySensitive(),
            ]}>
            외 {today.eventCount - 1}개
          </Text>
        ) : null}
      </VStack>
    );
  },
);

export const QuickMemoWidget = createWidget<TimeFlowerWidgetProps>(
  'TimeFlowerQuickMemo',
  (props, environment) => {
    'widget';

    const hasMemoPayload =
      !!props.palettes?.light &&
      !!props.palettes?.dark &&
      Array.isArray(props.memos) &&
      typeof props.preferredScheme === 'string' &&
      typeof props.memosUrl === 'string' &&
      typeof props.quickMemoUrl === 'string';
    if (!hasMemoPayload || props.expired) {
      return (
        <VStack
          alignment="leading"
          spacing={2}
          modifiers={[containerBackground('clear', 'widget')]}>
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>TimeFlower</Text>
          <Text modifiers={[font({ size: 10, weight: 'medium' })]}>{props.expired ? '앱을 열어 메모를 불러오세요' : '빠른 메모'}</Text>
        </VStack>
      );
    }

    const requestedScheme = props.preferredScheme;
    const scheme = requestedScheme === 'system' ? (environment.colorScheme ?? 'light') : requestedScheme;
    const colors = props.palettes[scheme];
    const first = props.memos[0];
    const rootModifiers = [
      containerBackground(colors.background, 'widget'),
      widgetURL(props.memosUrl),
      foregroundStyle(colors.text),
    ];

    if (environment.widgetFamily === 'accessoryInline') {
      return <Text modifiers={[lineLimit(1), privacySensitive()]}>{first?.content ?? '빠른 메모 쓰기'}</Text>;
    }

    if (environment.widgetFamily === 'accessoryCircular') {
      return (
        <Link destination={props.quickMemoUrl}>
          <VStack spacing={2} modifiers={rootModifiers}>
            <Image systemName="square.and.pencil" size={17} />
            <Text modifiers={[font({ size: 9, weight: 'semibold' })]}>메모</Text>
          </VStack>
        </Link>
      );
    }

    if (environment.widgetFamily === 'accessoryRectangular') {
      return (
        <Link destination={props.quickMemoUrl}>
          <HStack spacing={7} modifiers={rootModifiers}>
            <Image systemName="square.and.pencil" size={18} />
            <VStack alignment="leading" spacing={1}>
              <Text modifiers={[font({ size: 11, weight: 'semibold' })]}>빠른 메모</Text>
              <Text modifiers={[font({ size: 11 }), lineLimit(1), privacySensitive()]}>
                {first?.content ?? '눌러서 바로 기록하세요'}
              </Text>
            </VStack>
          </HStack>
        </Link>
      );
    }

    const visibleCount = environment.widgetFamily === 'systemMedium' ? 3 : 2;
    return (
      <VStack alignment="leading" spacing={8} modifiers={[...rootModifiers, padding({ all: 12 })]}>
        <HStack spacing={6}>
          <VStack alignment="leading" spacing={1}>
            <Text modifiers={[font({ size: 16, weight: 'bold' })]}>빠른 메모</Text>
            <Text modifiers={[font({ size: 9 }), foregroundStyle(colors.textSecondary), lineLimit(1)]}>
              {props.viewName}
            </Text>
          </VStack>
          <Spacer />
          <Link destination={props.quickMemoUrl}>
            <Image
              systemName="plus"
              size={14}
              color={colors.surface}
              modifiers={[background(colors.accent), cornerRadius(10), padding({ all: 7 })]}
            />
          </Link>
        </HStack>

        {props.memos.length === 0 ? (
          <Link destination={props.quickMemoUrl}>
            <Text modifiers={[font({ size: 12 }), foregroundStyle(colors.textSecondary)]}>
              눌러서 첫 메모를 남겨보세요
            </Text>
          </Link>
        ) : (
          props.memos.slice(0, visibleCount).map((memo) => (
            <HStack key={memo.id} spacing={6}>
              <Text modifiers={[foregroundStyle(memo.colors[scheme]), font({ size: 10 })]}>●</Text>
              <VStack alignment="leading" spacing={0}>
                <Text modifiers={[font({ size: 12, weight: 'medium' }), lineLimit(1), privacySensitive()]}>
                  {memo.content}
                </Text>
                <Text modifiers={[font({ size: 9 }), foregroundStyle(colors.textSecondary), lineLimit(1)]}>
                  {memo.calendarName}
                </Text>
              </VStack>
            </HStack>
          ))
        )}
      </VStack>
    );
  },
);
