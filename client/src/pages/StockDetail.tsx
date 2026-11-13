import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiRequestError, useHistory, useQuotes, useStocks } from '../api/client';
import { CandleChart, type MaLine } from '../components/CandleChart';
import { ErrorState } from '../components/ErrorState';
import { AlertIcon, ArrowLeftIcon, LogoIcon, RefreshIcon } from '../components/icons';
import { MaToggles } from '../components/MaToggles';
import { RangeSelector } from '../components/RangeSelector';
import { Skeleton } from '../components/Skeleton';
import { StockAlerts } from '../components/StockAlerts';
import { Stat, SummaryCard } from '../components/SummaryCard';
import { useTheme } from '../hooks/useTheme';
import {
  direction,
  formatChange,
  formatDate,
  formatPercent,
  formatPrice,
  formatTime,
} from '../lib/format';
import { highLow, sma } from '../lib/indicators';
import {
  isChartRange,
  MA_COLORS,
  MA_PERIODS,
  RANGE_CONFIG,
  visibleFrom,
  type ChartRange,
  type MaPeriod,
} from '../lib/ranges';

const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,15}$/;
const MA_STORAGE_KEY = 'maPeriods';
const DEFAULT_MAS: MaPeriod[] = [20, 50];

/** MA selection is a per-browser preference. */
function useMaSelection() {
  const [enabled, setEnabled] = useState<Set<MaPeriod>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MA_STORAGE_KEY) ?? 'null') as unknown;
      if (Array.isArray(saved)) {
        return new Set(MA_PERIODS.filter((p) => saved.includes(p)));
      }
    } catch {
      // ignore unreadable storage
    }
    return new Set(DEFAULT_MAS);
  });

  const toggle = (period: MaPeriod) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      try {
        localStorage.setItem(MA_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable: the choice still applies for this visit
      }
      return next;
    });

  return { enabled, toggle };
}

export function StockDetail() {
  const symbol = (useParams().symbol ?? '').toUpperCase();
  const [params, setParams] = useSearchParams();
  const rawRange = params.get('range');
  const range: ChartRange = isChartRange(rawRange) ? rawRange : '6M';
  const { theme } = useTheme();
  const { enabled, toggle } = useMaSelection();

  if (!SYMBOL_RE.test(symbol)) {
    return (
      <DetailShell>
        <ErrorState
          title="Symbol ไม่ถูกต้อง"
          message={`"${symbol}" ไม่ใช่รูปแบบ symbol ที่รองรับ`}
        />
      </DetailShell>
    );
  }

  return (
    <DetailContent
      symbol={symbol}
      range={range}
      onRangeChange={(r) => setParams({ range: r }, { replace: true })}
      theme={theme}
      enabledMas={enabled}
      onToggleMa={toggle}
    />
  );
}

interface ContentProps {
  symbol: string;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  enabledMas: Set<MaPeriod>;
  onToggleMa: (p: MaPeriod) => void;
}

function DetailContent({
  symbol,
  range,
  onRangeChange,
  theme,
  enabledMas,
  onToggleMa,
}: ContentProps) {
  const cfg = RANGE_CONFIG[range];
  const history = useHistory(symbol, cfg.fetch.range, cfg.fetch.interval);
  const quotes = useQuotes([symbol]);
  const stocks = useStocks();

  const stock = stocks.data?.find((s) => s.symbol === symbol);
  const quoteResult = quotes.data?.[0];
  const quote = quoteResult?.ok ? quoteResult.quote : undefined;
  const candles = useMemo(() => history.data?.candles ?? [], [history.data]);
  const last = candles.at(-1);
  const from = last ? visibleFrom(range, last.time) : 0;

  const allMas = useMemo(
    () =>
      Object.fromEntries(MA_PERIODS.map((p) => [p, sma(candles, p)])) as Record<
        MaPeriod,
        ReturnType<typeof sma>
      >,
    [candles],
  );
  const maLines = useMemo<MaLine[]>(
    () =>
      MA_PERIODS.filter((p) => enabledMas.has(p)).map((p) => ({
        period: p,
        color: MA_COLORS[p],
        points: allMas[p],
      })),
    [allMas, enabledMas],
  );
  const latestMa = useMemo(
    () =>
      Object.fromEntries(
        MA_PERIODS.flatMap((p) => {
          const v = allMas[p].at(-1)?.value;
          return v === undefined ? [] : [[p, v]];
        }),
      ) as Partial<Record<MaPeriod, number>>,
    [allMas],
  );

  // Range statistics use only the visible window
  const windowCandles = useMemo(() => candles.filter((c) => c.time >= from), [candles, from]);
  const rangeHL = highLow(windowCandles);
  const rangeStart = windowCandles[0]?.close;
  const rangeChangePct =
    rangeStart && last ? ((last.close - rangeStart) / rangeStart) * 100 : undefined;
  const yearHL = last ? highLow(candles, last.time - 365 * 86400) : null;
  const high52 = history.data?.fiftyTwoWeekHigh ?? yearHL?.high;
  const low52 = history.data?.fiftyTwoWeekLow ?? yearHL?.low;

  const price = quote?.price ?? last?.close;
  const currency = quote?.currency ?? history.data?.currency ?? '';
  const historyError = history.error;

  if (historyError instanceof ApiRequestError && historyError.status === 404) {
    return (
      <DetailShell>
        <ErrorState title={`ไม่พบข้อมูลหุ้น ${symbol}`} message={historyError.message} />
      </DetailShell>
    );
  }

  return (
    <DetailShell>
      {/* Title + live price */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{symbol}</h1>
            {stock && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {stock.market}
              </span>
            )}
            {stock && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-gilt-500/40 bg-gilt-300/15 px-2 py-0.5 text-xs font-medium text-gilt-700 dark:border-gilt-300/30 dark:text-gilt-300"
                title={`คัดกรองโดย ${stock.screenedBy}`}
              >
                <LogoIcon className="text-sm" />
                อยู่ในรายชื่อชาริอะห์
              </span>
            )}
          </div>
          {stocks.isPending ? (
            <Skeleton className="mt-1.5 h-4 w-48" />
          ) : (
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {stock ? (
                <>
                  {stock.name}
                  <span className="ml-2 text-slate-400 dark:text-slate-500">{stock.sector}</span>
                </>
              ) : (
                'ไม่อยู่ในรายชื่อหุ้นชาริอะห์'
              )}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          {price === undefined ? (
            <Skeleton className="ml-auto h-8 w-32" />
          ) : (
            <>
              <div className="num text-2xl font-semibold sm:text-3xl">
                {formatPrice(price)}{' '}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  {currency}
                </span>
              </div>
              {quote && (
                <div
                  className={`num text-sm font-medium ${
                    direction(quote.change) > 0
                      ? 'text-up dark:text-green-400'
                      : direction(quote.change) < 0
                        ? 'text-down dark:text-red-400'
                        : 'text-slate-500'
                  }`}
                >
                  {formatChange(quote.change)} ({formatPercent(quote.changePercent)})
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <RangeSelector value={range} onChange={onRangeChange} />
          <MaToggles enabled={enabledMas} onToggle={onToggleMa} latest={latestMa} />
        </div>
        <div className="relative h-[340px] sm:h-[460px]">
          {history.isPending ? (
            <Skeleton className="h-full w-full" />
          ) : history.isError && candles.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <ErrorState
                compact
                title="โหลดกราฟไม่สำเร็จ"
                message={history.error.message}
                onRetry={() => void history.refetch()}
                retrying={history.isFetching}
              />
            </div>
          ) : (
            <>
              <CandleChart candles={candles} maLines={maLines} visibleFrom={from} theme={theme} />
              {history.isPlaceholderData && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50">
                  <RefreshIcon className="animate-spin text-2xl text-slate-500" />
                </div>
              )}
            </>
          )}
        </div>
        {cfg.fetch.interval === '1wk' && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            ช่วง 5 ปีแสดงเป็นแท่งรายสัปดาห์ เส้น MA จึงคำนวณจากจำนวนสัปดาห์
          </p>
        )}
      </section>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="ราคาล่าสุด" loading={price === undefined}>
          <div className="num text-xl font-semibold">
            {formatPrice(price)}{' '}
            <span className="text-xs font-normal text-slate-400">{currency}</span>
          </div>
          {quote && (
            <>
              <Stat label="ปิดก่อนหน้า" value={formatPrice(quote.previousClose)} />
              <Stat
                label="เวลา"
                value={
                  quote.marketTime
                    ? `${formatDate(quote.marketTime)} ${formatTime(new Date(quote.marketTime))}`
                    : '—'
                }
              />
            </>
          )}
          {quoteResult && !quoteResult.ok && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              ดึงราคาล่าสุดไม่ได้ — แสดงราคาปิดจากกราฟแทน
            </p>
          )}
        </SummaryCard>

        <SummaryCard title={`ช่วง ${range}`} loading={history.isPending}>
          <Stat label="สูงสุด" value={formatPrice(rangeHL?.high)} />
          <Stat label="ต่ำสุด" value={formatPrice(rangeHL?.low)} />
          <Stat
            label="เปลี่ยนแปลง"
            value={formatPercent(rangeChangePct)}
            tone={
              direction(rangeChangePct) > 0
                ? 'up'
                : direction(rangeChangePct) < 0
                  ? 'down'
                  : undefined
            }
          />
        </SummaryCard>

        <SummaryCard title="52 สัปดาห์" loading={history.isPending}>
          <Stat label="สูงสุด" value={formatPrice(high52)} />
          <Stat label="ต่ำสุด" value={formatPrice(low52)} />
          {high52 !== undefined && low52 !== undefined && price !== undefined && high52 > low52 && (
            <RangeBar low={low52} high={high52} value={price} />
          )}
        </SummaryCard>

        <SummaryCard title="ข้อมูลชาริอะห์" loading={stocks.isPending}>
          {stock ? (
            <>
              <Stat
                label="คัดกรองโดย"
                value={<span className="font-sans">{stock.screenedBy}</span>}
              />
              <Stat label="อัปเดตเมื่อ" value={formatDate(stock.updatedAt)} />
              {/sample/i.test(stock.screenedBy) && (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertIcon className="mt-0.5 shrink-0" /> ข้อมูลตัวอย่าง ไม่ใช่ผลคัดกรองจริง
                </p>
              )}
            </>
          ) : (
            <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertIcon className="mt-0.5 shrink-0" />
              หุ้นนี้ไม่อยู่ในรายชื่อ — ยังไม่มีข้อมูลการคัดกรอง
            </p>
          )}
        </SummaryCard>
      </div>

      {stocks.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <StockAlerts symbol={symbol} quote={quote} inList={!!stock} />
      )}
    </DetailShell>
  );
}

/** Where the current price sits between the 52-week low and high. */
function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const pct = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <div className="mt-2" aria-label={`ราคาปัจจุบันอยู่ที่ ${pct.toFixed(0)}% ของช่วง 52 สัปดาห์`}>
      <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow dark:border-slate-900"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DetailShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Go back when we came from inside the app (keeps dashboard filters), else go home.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeftIcon /> กลับไป Watchlist
      </button>
      {children}
    </div>
  );
}
