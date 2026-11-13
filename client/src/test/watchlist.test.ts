import type { QuoteResult, Stock } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { visibleFrom } from '../lib/ranges';
import { buildRows, filterRows, sectorsOf, sortRows } from '../lib/watchlist';

const stock = (symbol: string, market: 'TH' | 'US', sector: string, name = symbol): Stock => ({
  symbol,
  name,
  market,
  sector,
  screenedBy: 'Test',
  updatedAt: '2026-01-01',
});

const STOCKS = [
  stock('ADVANC.BK', 'TH', 'Telecom', 'Advanced Info Service'),
  stock('AAPL', 'US', 'Technology', 'Apple'),
  stock('DELTA.BK', 'TH', 'Technology', 'Delta Electronics'),
];

const ok = (symbol: string, price: number, changePercent: number, volume = 1): QuoteResult => ({
  symbol,
  ok: true,
  quote: {
    symbol,
    price,
    change: 0,
    changePercent,
    volume,
    previousClose: null,
    currency: null,
    marketState: null,
    marketTime: null,
  },
});

const RESULTS: QuoteResult[] = [
  ok('ADVANC.BK', 334, 0),
  ok('AAPL', 343, 0.43),
  { symbol: 'DELTA.BK', ok: false, error: 'boom' },
];

describe('buildRows', () => {
  it('joins quotes and errors onto stocks', () => {
    const rows = buildRows(STOCKS, RESULTS);
    expect(rows[0]!.quote?.price).toBe(334);
    expect(rows[2]).toEqual({ stock: STOCKS[2], error: 'boom' });
  });

  it('leaves rows without a quote while quotes are loading', () => {
    expect(buildRows(STOCKS, undefined).every((r) => !r.quote && !r.error)).toBe(true);
  });
});

describe('filterRows', () => {
  const rows = buildRows(STOCKS, RESULTS);
  const all = { query: '', market: 'ALL', sector: 'ALL' } as const;
  const symbols = (r: ReturnType<typeof filterRows>) => r.map((x) => x.stock.symbol);

  it('matches symbol or name, case-insensitively', () => {
    expect(symbols(filterRows(rows, { ...all, query: 'delta' }))).toEqual(['DELTA.BK']);
    expect(symbols(filterRows(rows, { ...all, query: 'aap' }))).toEqual(['AAPL']);
    expect(symbols(filterRows(rows, { ...all, query: '  APPLE ' }))).toEqual(['AAPL']);
  });

  it('filters by market and sector together', () => {
    expect(symbols(filterRows(rows, { ...all, market: 'TH' }))).toEqual(['ADVANC.BK', 'DELTA.BK']);
    expect(symbols(filterRows(rows, { ...all, market: 'TH', sector: 'Technology' }))).toEqual([
      'DELTA.BK',
    ]);
  });
});

describe('sortRows', () => {
  const rows = buildRows(STOCKS, RESULTS);
  const symbols = (r: ReturnType<typeof sortRows>) => r.map((x) => x.stock.symbol);

  it('sorts text columns', () => {
    expect(symbols(sortRows(rows, 'symbol', 'asc'))).toEqual(['AAPL', 'ADVANC.BK', 'DELTA.BK']);
    expect(symbols(sortRows(rows, 'symbol', 'desc'))).toEqual(['DELTA.BK', 'ADVANC.BK', 'AAPL']);
  });

  it('keeps rows without a value last in both directions', () => {
    expect(symbols(sortRows(rows, 'price', 'desc'))).toEqual(['AAPL', 'ADVANC.BK', 'DELTA.BK']);
    expect(symbols(sortRows(rows, 'price', 'asc'))).toEqual(['ADVANC.BK', 'AAPL', 'DELTA.BK']);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortRows(rows, 'changePercent', 'desc');
    expect(rows).toEqual(copy);
  });
});

describe('sectorsOf', () => {
  it('returns unique sorted sectors', () => {
    expect(sectorsOf(STOCKS)).toEqual(['Technology', 'Telecom']);
  });
});

describe('visibleFrom', () => {
  it('counts back whole calendar months from the last candle', () => {
    const last = Date.UTC(2026, 9, 16) / 1000; // 16 Oct 2026
    expect(visibleFrom('1M', last)).toBe(Date.UTC(2026, 8, 16) / 1000);
    expect(visibleFrom('1Y', last)).toBe(Date.UTC(2025, 9, 16) / 1000);
    expect(visibleFrom('5Y', last)).toBe(Date.UTC(2021, 9, 16) / 1000);
  });
});
