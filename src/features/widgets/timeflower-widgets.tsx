import { createWidget } from 'expo-widgets';
import { Grid, HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  privacySensitive,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

import type { TimeFlowerWidgetProps } from './types';

export const CalendarWidget = createWidget<TimeFlowerWidgetProps>(
  'TimeFlowerCalendar',
  (props, environment) => {
    'widget';

    const requestedScheme = props.preferredScheme;
    const scheme = requestedScheme === 'system' ? (environment.colorScheme ?? 'light') : requestedScheme;
    const colors = props.palettes[scheme];
    const upcoming = props.events.filter((event) => event.endAt > environment.date.getTime());
    const first = upcoming[0];
    const rootModifiers = [
      containerBackground(colors.background, 'widget'),
      widgetURL(props.calendarUrl),
      foregroundStyle(colors.text),
    ];

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
            {upcoming.length > 0 ? `${upcoming.length}개` : '비었음'}
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
      return (
        <VStack alignment="leading" spacing={8} modifiers={[...rootModifiers, padding({ all: 12 })]}>
          <HStack alignment="center" spacing={6}>
            <VStack alignment="leading" spacing={1}>
              <Text modifiers={[font({ size: 18, weight: 'bold' })]}>{props.monthTitle}</Text>
              <Text modifiers={[font({ size: 10 }), foregroundStyle(colors.textSecondary), lineLimit(1)]}>
                {props.viewName}
              </Text>
            </VStack>
            <Spacer />
            {props.showQuickActions ? (
              <HStack spacing={6}>
                <Link destination={props.quickEventUrl}>
                  <HStack
                    spacing={4}
                    modifiers={[
                      background(colors.accent),
                      cornerRadius(9),
                      padding({ horizontal: 9, vertical: 6 }),
                    ]}>
                    <Image systemName="plus" size={11} color={colors.surface} />
                    <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(colors.surface)]}>
                      일정
                    </Text>
                  </HStack>
                </Link>
                <Link destination={props.quickMemoUrl}>
                  <Image
                    systemName="square.and.pencil"
                    size={15}
                    color={colors.accent}
                    modifiers={[
                      background(colors.accentSoft),
                      cornerRadius(9),
                      padding({ all: 7 }),
                    ]}
                  />
                </Link>
              </HStack>
            ) : null}
          </HStack>

          <Grid alignment="center" horizontalSpacing={2} verticalSpacing={4}>
            <Grid.Row>
              {props.weekdayLabels.map((weekday) => (
                <Text
                  key={weekday}
                  modifiers={[
                    font({ size: 9, weight: 'semibold' }),
                    foregroundStyle(colors.textSecondary),
                    frame({ width: 35 }),
                  ]}>
                  {weekday}
                </Text>
              ))}
            </Grid.Row>
            {props.monthWeeks.map((week) => (
              <Grid.Row key={week[0].key}>
                {week.map((day) => (
                  <Link key={day.key} destination={day.url}>
                    <VStack
                      spacing={3}
                      modifiers={[
                        frame({ width: 35, height: 29 }),
                        ...(day.isToday ? [background(colors.accentSoft), cornerRadius(8)] : []),
                      ]}>
                      <Text
                        modifiers={[
                          font({ size: 11, weight: day.isToday ? 'bold' : 'regular' }),
                          foregroundStyle(
                            day.isToday
                              ? colors.accent
                              : day.inMonth
                                ? colors.text
                                : colors.textTertiary,
                          ),
                        ]}>
                        {day.number}
                      </Text>
                      <HStack spacing={2}>
                        {day.eventColors.slice(0, 3).map((eventColor, index) => (
                          <Text
                            key={`${day.key}-${index}`}
                            modifiers={[
                              font({ size: 7 }),
                              foregroundStyle(eventColor[scheme]),
                              lineLimit(1),
                            ]}>
                            •
                          </Text>
                        ))}
                      </HStack>
                    </VStack>
                  </Link>
                ))}
              </Grid.Row>
            ))}
          </Grid>

          {first ? (
            <Link destination={first.url}>
              <HStack
                spacing={7}
                modifiers={[
                  background(colors.surface),
                  cornerRadius(10),
                  padding({ horizontal: 9, vertical: 7 }),
                ]}>
                <Text modifiers={[foregroundStyle(first.colors[scheme]), font({ size: 12 })]}>●</Text>
                <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1), privacySensitive()]}>
                  {first.title}
                </Text>
                <Spacer minLength={2} />
                <Text modifiers={[font({ size: 10 }), foregroundStyle(colors.textSecondary), lineLimit(1)]}>
                  {first.timeLabel}
                </Text>
              </HStack>
            </Link>
          ) : null}
        </VStack>
      );
    }

    const visibleCount = environment.widgetFamily === 'systemMedium' ? 3 : 2;
    return (
      <VStack alignment="leading" spacing={7} modifiers={[...rootModifiers, padding({ all: 12 })]}>
        <HStack alignment="top" spacing={6}>
          <VStack alignment="leading" spacing={0}>
            <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(colors.accent), lineLimit(1)]}>
              {props.dateTitle}
            </Text>
            <Text modifiers={[font({ size: 24, weight: 'bold' }), minimumScaleFactor(0.8)]}>
              {props.dayNumber}
            </Text>
          </VStack>
          <Spacer />
          {props.showQuickActions ? (
            <HStack spacing={6}>
              <Link destination={props.quickEventUrl}>
                <Image
                  systemName="calendar.badge.plus"
                  size={15}
                  color={colors.surface}
                  modifiers={[background(colors.accent), cornerRadius(10), padding({ all: 7 })]}
                />
              </Link>
              <Link destination={props.quickMemoUrl}>
                <Image
                  systemName="square.and.pencil"
                  size={15}
                  color={colors.accent}
                  modifiers={[background(colors.accentSoft), cornerRadius(10), padding({ all: 7 })]}
                />
              </Link>
            </HStack>
          ) : null}
        </HStack>

        <VStack alignment="leading" spacing={5}>
          {upcoming.length === 0 ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(colors.textSecondary)]}>
              예정된 일정이 없어요
            </Text>
          ) : (
            upcoming.slice(0, visibleCount).map((event) => (
              <Link key={`${event.id}-${event.sortAt}`} destination={event.url}>
                <HStack spacing={6}>
                  <Text modifiers={[foregroundStyle(event.colors[scheme]), font({ size: 10 })]}>●</Text>
                  <VStack alignment="leading" spacing={0}>
                    <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1), privacySensitive()]}>
                      {event.title}
                    </Text>
                    <Text modifiers={[font({ size: 9 }), foregroundStyle(colors.textSecondary), lineLimit(1)]}>
                      {event.timeLabel} · {event.calendarName}
                    </Text>
                  </VStack>
                </HStack>
              </Link>
            ))
          )}
        </VStack>
      </VStack>
    );
  },
);

export const QuickMemoWidget = createWidget<TimeFlowerWidgetProps>(
  'TimeFlowerQuickMemo',
  (props, environment) => {
    'widget';

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
