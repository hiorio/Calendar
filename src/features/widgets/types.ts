export type WidgetColorPair = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  onAccent: string;
  accent: string;
  accentSoft: string;
  border: string;
  sunday: string;
  saturday: string;
};

export type WidgetSchemeColors = { light: string; dark: string };

export type WidgetEventItem = {
  id: string;
  title: string;
  timeLabel: string;
  calendarName: string;
  colors: WidgetSchemeColors;
  url: string;
  sortAt: number;
  endAt: number;
};

export type WidgetMemoItem = {
  id: string;
  content: string;
  calendarName: string;
  colors: WidgetSchemeColors;
};

export type WidgetDayEventItem = {
  key: string;
  title: string;
  filled: boolean;
  colors: WidgetSchemeColors;
  textColors: WidgetSchemeColors;
};

export type WidgetDayItem = {
  key: string;
  number: number;
  weekday: number;
  inMonth: boolean;
  isToday: boolean;
  events: WidgetDayEventItem[];
  eventCount: number;
  hiddenEventCount: number;
  url: string;
};

export type WidgetWeekEventItem = {
  key: string;
  title: string;
  startColumn: number;
  endColumn: number;
  filled: boolean;
  colors: WidgetSchemeColors;
  textColors: WidgetSchemeColors;
  url: string;
};

export type WidgetWeekItem = {
  key: string;
  days: WidgetDayItem[];
  lanes: WidgetWeekEventItem[][];
};

export type WidgetMonthPage = {
  key: string;
  title: string;
  shortTitle: string;
  weeks: WidgetWeekItem[];
};

export type TimeFlowerWidgetProps = {
  /** Stored with the timeline so a new binary/layout can reject legacy widget payloads. */
  layoutRevision: number;
  expired?: boolean;
  viewName: string;
  dateTitle: string;
  weekdayTitle: string;
  dayNumber: string;
  monthTitle: string;
  monthShortTitle: string;
  monthKey: string;
  selectedMonthKey: string;
  todayMonthKey: string;
  adjacentMonthPages: WidgetMonthPage[];
  weekdayLabels: string[];
  monthWeeks: WidgetWeekItem[];
  events: WidgetEventItem[];
  upcomingEventCount: number;
  memos: WidgetMemoItem[];
  calendarUrl: string;
  quickEventUrl: string;
  quickMemoUrl: string;
  memosUrl: string;
  showQuickActions: boolean;
  preferredScheme: 'system' | 'light' | 'dark';
  palettes: { light: WidgetColorPair; dark: WidgetColorPair };
};
