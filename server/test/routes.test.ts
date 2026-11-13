import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryResponse, Market, Quote, Stock } from '@shared/types';
import { createApp } from '../src/app.js';
import {
  createPriceService,
  SymbolNotFoundError,
  type PriceSource,
} from '../src/services/priceService.js';
import type { ShariahRepository } from '../src/services/shariahService.js';

const CLIENT_ORIGIN = 'http://localhost:5173';

const STOCKS: Stock[] = [
  {
    symbol: 'ADVANC.BK',
    name: 'Advanced Info Service',
    market: 'TH',
    sector: 'Telecom',
    screenedBy: 'Test',
    updatedAt: '2026-01-01',
  },
  {
    symbol: 'AAPL',
    name: 'Apple',
    market: 'US',
    sector: 'Technology',
    screenedBy: 'Test',
    updatedAt: '2026-01-01',
  },
];

const memoryRepo: ShariahRepository = {
  list: async ({ market }: { market?: Market } = {}) =>
    market ? STOCKS.filter((s) => s.market === market) : STOCKS,
  get: async (symbol) => STOCKS.find((s) => s.symbol === symbol),
};

function quote(symbol: string, price: number): Quote {
  return {
    symbol,
    price,
    change: 1,
    changePercent: 0.5,
    volume: 1000,
    previousClose: price - 1,
    currency: 'USD',
    marketState: 'REGULAR',
    marketTime: '2026-10-16T20:00:00.000Z',
  };
}

function history(symbol: string): HistoryResponse {
  return {
    symbol,
    range: '1y',
    interval: '1d',
    currency: 'USD',
    fiftyTwoWeekHigh: 12,
    fiftyTwoWeekLow: 8,
    candles: [{ time: 1_700_000_000, open: 10, high: 12, low: 9, close: 11, volume: 500 }],
  };
}

/** Fake upstream: known symbols succeed, UNKNOWN is "not found", BROKEN throws a network-style error. */
function fakeSource() {
  return {
    fetchQuote: vi.fn(async (symbol: string) => {
      if (symbol === 'BROKEN') throw new Error('socket hang up');
      if (symbol === 'UNKNOWN') throw new SymbolNotFoundError(symbol);
      return quote(symbol, 100);
    }),
    fetchHistory: vi.fn(async (symbol: string) => {
      if (symbol === 'UNKNOWN') throw new SymbolNotFoundError(symbol);
      if (symbol === 'BROKEN') throw new Error('socket hang up');
      return history(symbol);
    }),
  } satisfies PriceSource;
}

let source: ReturnType<typeof fakeSource>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  source = fakeSource();
  app = createApp({
    clientOrigin: CLIENT_ORIGIN,
    shariah: memoryRepo,
    prices: createPriceService(source),
  });
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/stocks', () => {
  it('returns the full list', async () => {
    const res = await request(app).get('/api/stocks');
    expect(res.status).toBe(200);
    expect(res.body.stocks).toHaveLength(2);
  });

  it('filters by market', async () => {
    const res = await request(app).get('/api/stocks?market=TH');
    expect(res.body.stocks.map((s: Stock) => s.symbol)).toEqual(['ADVANC.BK']);
  });

  it('rejects an unknown market with a readable 400', async () => {
    const res = await request(app).get('/api/stocks?market=JP');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('market');
  });
});

describe('GET /api/quotes', () => {
  it('returns quotes in request order, upper-cased and de-duplicated', async () => {
    const res = await request(app).get('/api/quotes?symbols=aapl,ADVANC.BK,AAPL');
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { symbol: string }) => r.symbol)).toEqual([
      'AAPL',
      'ADVANC.BK',
    ]);
    expect(res.body.results[0]).toMatchObject({ ok: true, quote: { price: 100 } });
  });

  it('reports per-symbol errors without failing the whole request', async () => {
    const res = await request(app).get('/api/quotes?symbols=AAPL,UNKNOWN,BROKEN');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      expect.objectContaining({ symbol: 'AAPL', ok: true }),
      { symbol: 'UNKNOWN', ok: false, error: 'No data found for symbol "UNKNOWN"' },
      { symbol: 'BROKEN', ok: false, error: 'socket hang up' },
    ]);
  });

  it('serves repeat requests from the cache', async () => {
    await request(app).get('/api/quotes?symbols=AAPL');
    await request(app).get('/api/quotes?symbols=AAPL');
    expect(source.fetchQuote).toHaveBeenCalledTimes(1);
  });

  it('requires the symbols parameter', async () => {
    const res = await request(app).get('/api/quotes');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed symbols', async () => {
    const res = await request(app).get('/api/quotes?symbols=AAPL,bad%20sym');
    expect(res.status).toBe(400);
    expect(source.fetchQuote).not.toHaveBeenCalled();
  });

  it('caps the number of symbols per request', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `S${i}`).join(',');
    const res = await request(app).get(`/api/quotes?symbols=${many}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/history/:symbol', () => {
  it('returns candles with defaults range=1y interval=1d', async () => {
    const res = await request(app).get('/api/history/aapl');
    expect(res.status).toBe(200);
    expect(res.body.candles).toHaveLength(1);
    expect(source.fetchHistory).toHaveBeenCalledWith('AAPL', '1y', '1d');
  });

  it('passes range and interval through', async () => {
    await request(app).get('/api/history/AAPL?range=5y&interval=1wk');
    expect(source.fetchHistory).toHaveBeenCalledWith('AAPL', '5y', '1wk');
  });

  it('caches per symbol + range + interval', async () => {
    await request(app).get('/api/history/AAPL?range=1y');
    await request(app).get('/api/history/AAPL?range=1y');
    await request(app).get('/api/history/AAPL?range=6mo');
    expect(source.fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid range', async () => {
    const res = await request(app).get('/api/history/AAPL?range=7d');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('range');
  });

  it('returns 404 for an unknown symbol', async () => {
    const res = await request(app).get('/api/history/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SYMBOL_NOT_FOUND');
  });

  it('returns 502 when the upstream fails', async () => {
    const res = await request(app).get('/api/history/BROKEN');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });
});

describe('errors and CORS', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('only allows the configured client origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', CLIENT_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(CLIENT_ORIGIN);
  });
});
