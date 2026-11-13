/**
 * Types (and a few constant lists) shared between client and server.
 * Keep this file dependency-free so both sides can import it via the `@shared/*` alias.
 */

export type Market = 'TH' | 'US';

/** One entry of the Shariah-screened stock list. */
export interface Stock {
  /** Yahoo Finance symbol, e.g. "ADVANC.BK" or "AAPL" */
  symbol: string;
  name: string;
  market: Market;
  sector: string;
  /** Who screened this stock (index provider, scholar board, etc.) */
  screenedBy: string;
  /** Date the screening status was last confirmed (YYYY-MM-DD) */
  updatedAt: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  previousClose: number | null;
  currency: string | null;
  marketState: string | null;
  /** ISO timestamp of the last regular-market trade */
  marketTime: string | null;
}

export type QuoteResult =
  { symbol: string; ok: true; quote: Quote } | { symbol: string; ok: false; error: string };

export interface QuotesResponse {
  results: QuoteResult[];
}

/** OHLCV bar. `time` is a UNIX timestamp in seconds (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const HISTORY_RANGES = ['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export const HISTORY_INTERVALS = ['1d', '1wk', '1mo'] as const;
export type HistoryInterval = (typeof HISTORY_INTERVALS)[number];

export interface HistoryResponse {
  symbol: string;
  range: HistoryRange;
  interval: HistoryInterval;
  currency: string | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  candles: Candle[];
}

export interface StocksResponse {
  stocks: Stock[];
}

// ---------------------------------------------------------------------------
// Price alerts (sent to Discord)
// ---------------------------------------------------------------------------

/**
 * price_above / price_below compare the latest price with `threshold`.
 * change_up / change_down compare today's % change with +threshold / -threshold.
 */
export const ALERT_CONDITIONS = ['price_above', 'price_below', 'change_up', 'change_down'] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

/** Cooldown choices offered in the UI (minutes). The API accepts any value up to a week. */
export const ALERT_COOLDOWN_CHOICES = [60, 240, 1440] as const;
export const DEFAULT_ALERT_COOLDOWN_MINUTES = 1440;

export interface AlertRule {
  id: number;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  /** Minimum time between two notifications of the same rule */
  cooldownMinutes: number;
  active: boolean;
  /** ISO timestamps */
  createdAt: string;
  lastTriggeredAt: string | null;
  lastTriggeredPrice: number | null;
  /** `marketTime` of the quote that last triggered — used to avoid re-alerting on a stale price */
  lastTriggeredMarketTime: string | null;
}

export interface CreateAlertInput {
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  cooldownMinutes?: number;
}

export type UpdateAlertInput = Partial<
  Pick<AlertRule, 'condition' | 'threshold' | 'cooldownMinutes' | 'active'>
>;

export interface AlertsResponse {
  alerts: AlertRule[];
}

export interface AlertResponse {
  alert: AlertRule;
}

/** Result of one pass of the alert checker. */
export interface AlertCheckSummary {
  startedAt: string;
  finishedAt: string;
  /** Active rules that were evaluated */
  checked: number;
  /** Notifications sent */
  triggered: number;
  /** Set when the whole pass was skipped (e.g. no webhook configured) */
  skippedReason: string | null;
  errors: { symbol: string; alertId?: number; message: string }[];
}

export interface AlertStatusResponse {
  webhookConfigured: boolean;
  /** Cron expression of the background check */
  schedule: string;
  nextCheckAt: string | null;
  lastCheck: AlertCheckSummary | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
