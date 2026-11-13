import YahooFinance from 'yahoo-finance2';
import type {
  Candle,
  HistoryInterval,
  HistoryRange,
  HistoryResponse,
  Quote,
  QuoteResult,
} from '@shared/types';
import { TTLCache } from '../lib/cache.js';
import { errorMessage } from '../lib/errors.js';

export const QUOTE_TTL_MS = 60_000;
export const HISTORY_TTL_MS = 5 * 60_000;

/**
 * Raw market-data provider. Yahoo Finance is the default; tests (and any future
 * provider) implement the same two methods.
 */
export interface PriceSource {
  fetchQuote(symbol: string): Promise<Quote>;
  fetchHistory(
    symbol: string,
    range: HistoryRange,
    interval: HistoryInterval,
  ): Promise<HistoryResponse>;
}

/**
 * Cached price access shared by the HTTP API and (in phase 2) the alert checker.
 */
export interface PriceService {
  /** Never rejects: a symbol that fails is returned with `ok: false` and its error. */
  getQuotes(symbols: string[]): Promise<QuoteResult[]>;
  getHistory(
    symbol: string,
    range: HistoryRange,
    interval: HistoryInterval,
  ): Promise<HistoryResponse>;
}

export function createPriceService(
  source: PriceSource = createYahooSource(),
  options: { quoteTtlMs?: number; historyTtlMs?: number } = {},
): PriceService {
  const quoteCache = new TTLCache<Quote>(options.quoteTtlMs ?? QUOTE_TTL_MS);
  const historyCache = new TTLCache<HistoryResponse>(options.historyTtlMs ?? HISTORY_TTL_MS);

  return {
    async getQuotes(symbols) {
      const settled = await Promise.allSettled(
        symbols.map((symbol) => quoteCache.getOrSet(symbol, () => source.fetchQuote(symbol))),
      );
      return settled.map((r, i): QuoteResult => {
        const symbol = symbols[i]!;
        return r.status === 'fulfilled'
          ? { symbol, ok: true, quote: r.value }
          : { symbol, ok: false, error: errorMessage(r.reason) };
      });
    },

    getHistory(symbol, range, interval) {
      return historyCache.getOrSet(`${symbol}|${range}|${interval}`, () =>
        source.fetchHistory(symbol, range, interval),
      );
    },
  };
}

/** Thrown when the upstream provider has no data for a symbol. */
export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`No data found for symbol "${symbol}"`);
    this.name = 'SymbolNotFoundError';
  }
}

const RANGE_MONTHS: Record<HistoryRange, number> = {
  '1mo': 1,
  '3mo': 3,
  '6mo': 6,
  '1y': 12,
  '2y': 24,
  '5y': 60,
  '10y': 120,
};

/** Trims float noise from Yahoo prices (e.g. 255.88999938964844 → 255.89). */
function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function rangeStart(range: HistoryRange, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - RANGE_MONTHS[range]);
  return start;
}

/** The subset of Yahoo's chart() result we read (validation is off, so it is typed `unknown`). */
interface YahooChartResult {
  meta: { currency?: string; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number };
  quotes: Array<{
    date: Date | string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }>;
}

export function createYahooSource(): PriceSource {
  const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  return {
    async fetchQuote(symbol) {
      // validateResult: false — Yahoo occasionally adds/omits fields, which would otherwise
      // fail the whole call. We read the few fields we need defensively below.
      const q = await yf.quote(symbol, {}, { validateResult: false });
      if (!q || typeof q.regularMarketPrice !== 'number') throw new SymbolNotFoundError(symbol);

      return {
        symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume ?? 0,
        previousClose: q.regularMarketPreviousClose ?? null,
        currency: q.currency ?? null,
        marketState: q.marketState ?? null,
        marketTime: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : null,
      };
    },

    async fetchHistory(symbol, range, interval) {
      const result = (await yf
        .chart(symbol, { period1: rangeStart(range), interval }, { validateResult: false })
        .catch((err: unknown) => {
          if (/no data found|not found|delisted/i.test(errorMessage(err))) {
            throw new SymbolNotFoundError(symbol);
          }
          throw err;
        })) as YahooChartResult;

      const candles: Candle[] = [];
      for (const q of result.quotes) {
        if (q.open == null || q.high == null || q.low == null || q.close == null) continue;
        const candle: Candle = {
          time: Math.floor(new Date(q.date).getTime() / 1000),
          open: round(q.open),
          high: round(q.high),
          low: round(q.low),
          close: round(q.close),
          volume: q.volume ?? 0,
        };
        // Charts need strictly increasing times; Yahoo sometimes repeats the live bar.
        const prev = candles.at(-1);
        if (prev && candle.time <= prev.time) candles[candles.length - 1] = candle;
        else candles.push(candle);
      }
      if (candles.length === 0) throw new SymbolNotFoundError(symbol);

      return {
        symbol,
        range,
        interval,
        currency: result.meta.currency ?? null,
        fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow ?? null,
        candles,
      };
    },
  };
}
