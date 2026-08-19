export type WidgetColorPair = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  border: string;
};

export type WidgetEventItem = {
  id: string;
  title: string;
  timeLabel: string;
  calendarName: string;
  colors: { light: string; dark: string };
  url: string;
  sortAt: number;
  endAt: number;
};

export type WidgetMemoItem = {
  id: string;
  content: string;
  calendarName: string;
  colors: { light: string; dark: string };
};

export type WidgetDayItem = {
  key: string;
  number: number;
  inMonth: boolean;
  isToday: boolean;
  eventColors: { light: string; dark: string }[];
  url: string;
};

export type TimeFlowerWidgetProps = {
  viewName: string;
  dateTitle: string;
  dayNumber: string;
  monthTitle: string;
  weekdayLabels: string[];
  monthWeeks: WidgetDayItem[][];
  events: WidgetEventItem[];
  memos: WidgetMemoItem[];
  calendarUrl: string;
  quickEventUrl: string;
  quickMemoUrl: string;
  memosUrl: string;
  showQuickActions: boolean;
  preferredScheme: 'system' | 'light' | 'dark';
  palettes: { light: WidgetColorPair; dark: WidgetColorPair };
};
