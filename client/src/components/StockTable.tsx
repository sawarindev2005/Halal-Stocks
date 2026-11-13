import type { KeyboardEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatPrice, formatVolume } from '../lib/format';
import type { SortDir, SortKey, WatchlistRow } from '../lib/watchlist';
import { ChangeBadge } from './ChangeBadge';
import { AlertIcon, SortIcon } from './icons';
import { Skeleton } from './Skeleton';

interface Column {
  key: SortKey;
  label: string;
  /** Label used on narrow screens */
  shortLabel?: string;
  align: 'left' | 'right';
  /** Tailwind classes that hide the column on narrow screens */
  hide?: string;
}

const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Symbol', align: 'left' },
  { key: 'name', label: 'ชื่อ', align: 'left', hide: 'hidden md:table-cell' },
  { key: 'market', label: 'ตลาด', align: 'left', hide: 'hidden sm:table-cell' },
  { key: 'price', label: 'ราคา', align: 'right' },
  { key: 'changePercent', label: '% เปลี่ยนแปลง', shortLabel: '%', align: 'right' },
  { key: 'volume', label: 'Volume', align: 'right', hide: 'hidden sm:table-cell' },
];

interface Props {
  rows: WatchlistRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  /** Quotes have not arrived yet: show skeletons in the price columns */
  quotesLoading: boolean;
}

export function StockTable({ rows, sortKey, sortDir, onSort, quotesLoading }: Props) {
  const navigate = useNavigate();
  const open = (symbol: string) => navigate(`/stock/${encodeURIComponent(symbol)}`);

  const onRowKey = (e: KeyboardEvent, symbol: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(symbol);
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <tr>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`px-2.5 py-2.5 font-medium whitespace-nowrap sm:px-4 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.hide ?? ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className={`inline-flex items-center gap-1 rounded transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:hover:text-white ${
                      col.align === 'right' ? 'flex-row-reverse' : ''
                    } ${active ? 'text-slate-900 dark:text-white' : ''}`}
                  >
                    {col.shortLabel ? (
                      <>
                        <span className="sm:hidden">{col.shortLabel}</span>
                        <span className="hidden sm:inline">{col.label}</span>
                      </>
                    ) : (
                      col.label
                    )}
                    <SortIcon
                      dir={active ? sortDir : null}
                      className={active ? '' : 'opacity-40'}
                    />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(({ stock, quote, error }) => (
            <tr
              key={stock.symbol}
              tabIndex={0}
              onClick={() => open(stock.symbol)}
              onKeyDown={(e) => onRowKey(e, stock.symbol)}
              className="cursor-pointer transition hover:bg-slate-50 focus-visible:bg-brand-50 focus-visible:outline-none dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800"
            >
              <td className="px-2.5 py-3 sm:px-4">
                <Link
                  to={`/stock/${encodeURIComponent(stock.symbol)}`}
                  tabIndex={-1}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-brand-700 hover:underline dark:text-brand-500"
                >
                  {stock.symbol}
                </Link>
                {/* Name moves under the symbol when its own column is hidden */}
                <div className="max-w-[7rem] truncate sm:max-w-[9rem] text-xs text-slate-500 md:hidden dark:text-slate-400">
                  {stock.name}
                </div>
              </td>
              <td className="hidden px-4 py-3 text-slate-700 md:table-cell dark:text-slate-300">
                {stock.name}
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <MarketTag market={stock.market} />
              </td>
              <QuoteCell loading={quotesLoading && !quote && !error} error={error}>
                <span className="num font-medium">{formatPrice(quote?.price)}</span>
                {quote?.currency && (
                  <span className="ml-1 hidden text-xs text-slate-400 sm:inline dark:text-slate-500">
                    {quote.currency}
                  </span>
                )}
              </QuoteCell>
              <QuoteCell loading={quotesLoading && !quote && !error} error={error}>
                <ChangeBadge percent={quote?.changePercent} />
              </QuoteCell>
              <QuoteCell
                loading={quotesLoading && !quote && !error}
                error={error}
                className="hidden sm:table-cell"
              >
                <span className="num text-slate-600 dark:text-slate-300">
                  {formatVolume(quote?.volume)}
                </span>
              </QuoteCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteCell({
  loading,
  error,
  className = '',
  children,
}: {
  loading: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td className={`px-2.5 py-3 text-right whitespace-nowrap sm:px-4 ${className}`}>
      {loading ? (
        <Skeleton className="ml-auto h-4 w-16" />
      ) : error ? (
        <span
          className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500"
          title={`ดึงราคาไม่ได้: ${error}`}
        >
          <AlertIcon className="text-amber-500" />—
        </span>
      ) : (
        children
      )}
    </td>
  );
}

function MarketTag({ market }: { market: string }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {market}
    </span>
  );
}

export function StockTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      aria-busy="true"
      aria-label="กำลังโหลดรายชื่อหุ้น"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
        <Skeleton className="h-3 w-1/2" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0 dark:border-slate-800"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="hidden h-4 flex-1 md:block" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="hidden h-4 w-14 sm:block" />
        </div>
      ))}
    </div>
  );
}
