import type { Market } from '@shared/types';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { QUOTES_REFRESH_MS, useQuotes, useStocks } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { AlertIcon, RefreshIcon, SearchIcon } from '../components/icons';
import { StockTable, StockTableSkeleton } from '../components/StockTable';
import { formatTime } from '../lib/format';
import {
  buildRows,
  defaultDir,
  filterRows,
  sectorsOf,
  sortRows,
  type SortDir,
  type SortKey,
} from '../lib/watchlist';

const SORT_KEYS: SortKey[] = ['symbol', 'name', 'market', 'price', 'changePercent', 'volume'];
const MARKETS: Array<{ value: Market | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'TH', label: 'ไทย' },
  { value: 'US', label: 'สหรัฐฯ' },
];

/** Filters and sort live in the URL so they survive navigating to a stock and back. */
function useWatchlistParams() {
  const [params, setParams] = useSearchParams();
  const rawSort = params.get('sort') as SortKey | null;
  const sortKey: SortKey = rawSort && SORT_KEYS.includes(rawSort) ? rawSort : 'symbol';
  const rawMarket = params.get('market');

  const state = {
    query: params.get('q') ?? '',
    market: (rawMarket === 'TH' || rawMarket === 'US' ? rawMarket : 'ALL') as Market | 'ALL',
    sector: params.get('sector') ?? 'ALL',
    sortKey,
    sortDir: (params.get('dir') === 'asc' || params.get('dir') === 'desc'
      ? params.get('dir')
      : defaultDir(sortKey)) as SortDir,
  };

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '' || v === 'ALL') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  return { ...state, update };
}

export function Dashboard() {
  const stocksQuery = useStocks();
  const stocks = useMemo(() => stocksQuery.data ?? [], [stocksQuery.data]);
  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const quotesQuery = useQuotes(symbols);
  const { query, market, sector, sortKey, sortDir, update } = useWatchlistParams();

  const sectors = useMemo(() => sectorsOf(stocks), [stocks]);
  const rows = useMemo(
    () =>
      sortRows(
        filterRows(buildRows(stocks, quotesQuery.data), { query, market, sector }),
        sortKey,
        sortDir,
      ),
    [stocks, quotesQuery.data, query, market, sector, sortKey, sortDir],
  );
  const sampleStocks = stocks.filter((s) => /sample/i.test(s.screenedBy));
  const failedCount = quotesQuery.data?.filter((r) => !r.ok).length ?? 0;
  const filtersActive = query !== '' || market !== 'ALL' || sector !== 'ALL';

  const onSort = (key: SortKey) => {
    const dir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : defaultDir(key);
    update({ sort: key, dir });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="max-w-xl">
          <h1 className="text-3xl leading-tight font-semibold sm:text-[2.5rem]">
            หุ้นชาริอะห์ที่ติดตาม
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {stocks.length > 0
              ? `แสดง ${rows.length} จาก ${stocks.length} ตัว ทั้งหุ้นไทยและสหรัฐฯ ที่ผ่านการคัดกรองแล้ว`
              : 'หุ้นไทยและสหรัฐฯ ที่ผ่านการคัดกรองชาริอะห์'}
          </p>
        </div>
        <RefreshStatus
          updatedAt={quotesQuery.dataUpdatedAt}
          fetching={quotesQuery.isFetching}
          onRefresh={() => void quotesQuery.refetch()}
          disabled={symbols.length === 0}
        />
      </div>

      {sampleStocks.length > 0 && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertIcon className="mt-0.5 shrink-0" />
          <p>
            {sampleStocks.length === stocks.length ? (
              <>
                รายชื่อหุ้นตอนนี้เป็น<strong className="font-semibold">ข้อมูลตัวอย่าง</strong>
              </>
            ) : (
              <>
                {sampleStocks.length} ตัวเป็น
                <strong className="font-semibold">ข้อมูลตัวอย่าง</strong> (
                {sampleStocks.map((s) => s.symbol).join(', ')})
              </>
            )}{' '}
            ไม่ใช่ผลการคัดกรองจริง — แก้ไขได้ที่{' '}
            <code className="text-xs">server/data/shariah_list.json</code>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">ค้นหาหุ้น</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="ค้นหา symbol หรือชื่อบริษัท"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <div
            role="radiogroup"
            aria-label="ตลาด"
            className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            {MARKETS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={market === m.value}
                onClick={() => update({ market: m.value })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  market === m.value
                    ? 'bg-brand-700 text-white dark:bg-brand-600'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label className="min-w-[7.5rem] flex-1 sm:flex-none">
            <span className="sr-only">กลุ่มอุตสาหกรรม</span>
            <select
              value={sector}
              onChange={(e) => update({ sector: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-8 pl-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none sm:w-48 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">ทุกกลุ่ม</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {quotesQuery.isError && (
        <ErrorState
          compact
          title="ดึงราคาไม่สำเร็จ"
          message={quotesQuery.error.message}
          onRetry={() => void quotesQuery.refetch()}
          retrying={quotesQuery.isFetching}
        />
      )}
      {failedCount > 0 && !quotesQuery.isError && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          ดึงราคาไม่ได้ {failedCount} ตัว — วางเมาส์ที่ไอคอน ⚠ เพื่อดูสาเหตุ
        </p>
      )}

      {stocksQuery.isPending ? (
        <StockTableSkeleton />
      ) : stocksQuery.isError ? (
        <ErrorState
          title="โหลดรายชื่อหุ้นไม่สำเร็จ"
          message={stocksQuery.error.message}
          onRetry={() => void stocksQuery.refetch()}
          retrying={stocksQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {filtersActive ? (
            <>
              ไม่พบหุ้นที่ตรงกับเงื่อนไข{' '}
              <button
                type="button"
                onClick={() => update({ q: null, market: null, sector: null })}
                className="font-medium text-brand-700 hover:underline dark:text-brand-500"
              >
                ล้างตัวกรอง
              </button>
            </>
          ) : (
            'ยังไม่มีหุ้นในรายชื่อ — เพิ่มได้ที่ server/data/shariah_list.json'
          )}
        </div>
      ) : (
        <StockTable
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          quotesLoading={quotesQuery.isPending}
        />
      )}
    </div>
  );
}

function RefreshStatus({
  updatedAt,
  fetching,
  onRefresh,
  disabled,
}: {
  updatedAt: number;
  fetching: boolean;
  onRefresh: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
      <div className="leading-tight sm:text-right">
        <div>
          อัปเดตล่าสุด{' '}
          <span className="num font-medium text-slate-700 dark:text-slate-200">
            {updatedAt ? formatTime(updatedAt) : '—'}
          </span>
        </div>
        <div>รีเฟรชอัตโนมัติทุก {QUOTES_REFRESH_MS / 1000} วินาที</div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled || fetching}
        aria-label="รีเฟรชราคา"
        title="รีเฟรชราคา"
        className="rounded-lg border border-slate-300 bg-white p-2 text-base text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <RefreshIcon className={fetching ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
