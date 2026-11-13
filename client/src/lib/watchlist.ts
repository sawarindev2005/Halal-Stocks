import type { Market, Quote, QuoteResult, Stock } from '@shared/types';

export interface WatchlistRow {
  stock: Stock;
  quote?: Quote;
  /** Set when the server could not load this symbol's quote */
  error?: string;
}

export type SortKey = 'symbol' | 'name' | 'market' | 'price' | 'changePercent' | 'volume';
export type SortDir = 'asc' | 'desc';

export interface WatchlistFilter {
  query: string;
  market: Market | 'ALL';
  sector: string | 'ALL';
}

export function buildRows(stocks: Stock[], results: QuoteResult[] | undefined): WatchlistRow[] {
  const bySymbol = new Map(results?.map((r) => [r.symbol, r]));
  return stocks.map((stock) => {
    const r = bySymbol.get(stock.symbol);
    if (!r) return { stock };
    return r.ok ? { stock, quote: r.quote } : { stock, error: r.error };
  });
}

export function filterRows(rows: WatchlistRow[], { query, market, sector }: WatchlistFilter) {
  const q = query.trim().toLowerCase();
  return rows.filter(({ stock }) => {
    if (market !== 'ALL' && stock.market !== market) return false;
    if (sector !== 'ALL' && stock.sector !== sector) return false;
    if (!q) return true;
    return stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q);
  });
}

function sortValue(row: WatchlistRow, key: SortKey): string | number | undefined {
  switch (key) {
    case 'symbol':
    case 'name':
    case 'market':
      return row.stock[key];
    case 'price':
      return row.quote?.price;
    case 'changePercent':
      return row.quote?.changePercent;
    case 'volume':
      return row.quote?.volume;
  }
}

/** Stable sort; rows without a value (e.g. a failed quote) always go last. */
export function sortRows(rows: WatchlistRow[], key: SortKey, dir: SortDir): WatchlistRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'th');
    return cmp * sign;
  });
}

/** Text columns start ascending; numeric columns start descending (biggest first). */
export function defaultDir(key: SortKey): SortDir {
  return key === 'symbol' || key === 'name' || key === 'market' ? 'asc' : 'desc';
}

export function sectorsOf(stocks: Stock[]): string[] {
  return [...new Set(stocks.map((s) => s.sector))].sort((a, b) => a.localeCompare(b));
}
