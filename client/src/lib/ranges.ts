import type { HistoryInterval, HistoryRange } from '@shared/types';

export const CHART_RANGES = ['1M', '3M', '6M', '1Y', '5Y'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

interface RangeConfig {
  /** Months shown on screen */
  months: number;
  /**
   * What we fetch: wider than what we show, so long MAs (up to 200 bars) already have
   * values at the left edge of the visible window. 1M–1Y share one request.
   */
  fetch: { range: HistoryRange; interval: HistoryInterval };
}

export const RANGE_CONFIG: Record<ChartRange, RangeConfig> = {
  '1M': { months: 1, fetch: { range: '2y', interval: '1d' } },
  '3M': { months: 3, fetch: { range: '2y', interval: '1d' } },
  '6M': { months: 6, fetch: { range: '2y', interval: '1d' } },
  '1Y': { months: 12, fetch: { range: '2y', interval: '1d' } },
  // 200 weekly bars ≈ 3.8 years of look-back before the 5-year window
  '5Y': { months: 60, fetch: { range: '10y', interval: '1wk' } },
};

export function isChartRange(v: string | null): v is ChartRange {
  return v !== null && (CHART_RANGES as readonly string[]).includes(v);
}

/** UNIX seconds of the left edge of the window, counted back from `lastTime`. */
export function visibleFrom(range: ChartRange, lastTime: number): number {
  const d = new Date(lastTime * 1000);
  d.setUTCMonth(d.getUTCMonth() - RANGE_CONFIG[range].months);
  return Math.floor(d.getTime() / 1000);
}

export const MA_PERIODS = [20, 50, 100, 200] as const;
export type MaPeriod = (typeof MA_PERIODS)[number];

/** Distinct from the green/red candle colours and readable on both themes. */
export const MA_COLORS: Record<MaPeriod, string> = {
  20: '#f59e0b',
  50: '#0d9488',
  100: '#a855f7',
  200: '#ec4899',
};
