import type { Candle } from '@shared/types';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../hooks/useTheme';
import { formatPrice, formatVolume } from '../lib/format';
import type { LinePoint } from '../lib/indicators';

export interface MaLine {
  period: number;
  color: string;
  points: LinePoint[];
}

interface Props {
  candles: Candle[];
  maLines: MaLine[];
  /** UNIX seconds of the left edge of the initially visible window */
  visibleFrom: number;
  theme: Theme;
}

const PALETTE = {
  light: {
    text: '#4a556f',
    grid: '#e8ecf3',
    border: '#d6dce7',
    up: '#16a34a',
    down: '#dc2626',
    volUp: 'rgba(22,163,74,0.35)',
    volDown: 'rgba(220,38,38,0.35)',
  },
  dark: {
    text: '#8a95ad',
    grid: '#232b42',
    border: '#374059',
    up: '#22c55e',
    down: '#ef4444',
    volUp: 'rgba(34,197,94,0.35)',
    volDown: 'rgba(239,68,68,0.35)',
  },
} as const;

const ts = (t: number) => t as UTCTimestamp;

export function CandleChart({ candles, maLines, visibleFrom, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maRefs = useRef(new Map<number, ISeriesApi<'Line'>>());
  const [hover, setHover] = useState<Candle | null>(null);

  // Create the chart once per mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: true,
        panes: { separatorColor: 'transparent' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.06, bottom: 0.1 } },
      timeScale: { rightOffset: 3, fixLeftEdge: true },
    });
    candleRef.current = chart.addSeries(CandlestickSeries, { priceLineVisible: false });
    volumeRef.current = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    );
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
    // Keep the top volume label clear of the lowest price label at the pane boundary
    volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.35, bottom: 0 } });
    chartRef.current = chart;

    const maSeries = maRefs.current;
    return () => {
      maSeries.clear();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Theme colours
  useEffect(() => {
    const p = PALETTE[theme];
    chartRef.current?.applyOptions({
      layout: { textColor: p.text },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.border },
      timeScale: { borderColor: p.border },
    });
    candleRef.current?.applyOptions({
      upColor: p.up,
      downColor: p.down,
      borderUpColor: p.up,
      borderDownColor: p.down,
      wickUpColor: p.up,
      wickDownColor: p.down,
    });
    volumeRef.current?.setData(
      candles.map((c) => ({
        time: ts(c.time),
        value: c.volume,
        color: c.close >= c.open ? p.volUp : p.volDown,
      })),
    );
  }, [theme, candles]);

  // Price data
  useEffect(() => {
    candleRef.current?.setData(candles.map((c) => ({ ...c, time: ts(c.time) })));
  }, [candles]);

  // Visible window — reapplied when the data or chosen range changes
  useEffect(() => {
    const last = candles.at(-1);
    if (!chartRef.current || !last) return;
    chartRef.current.timeScale().setVisibleRange({ from: ts(visibleFrom), to: ts(last.time) });
  }, [candles, visibleFrom]);

  // Moving averages: add/update enabled lines, remove disabled ones
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const existing = maRefs.current;
    const wanted = new Set(maLines.map((m) => m.period));
    for (const [period, series] of existing) {
      if (!wanted.has(period)) {
        chart.removeSeries(series);
        existing.delete(period);
      }
    }
    for (const ma of maLines) {
      let series = existing.get(ma.period);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: ma.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        existing.set(ma.period, series);
      }
      series.setData(ma.points.map((p) => ({ time: ts(p.time), value: p.value })));
    }
  }, [maLines]);

  // OHLCV readout for the bar under the crosshair (falls back to the latest bar)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const byTime = new Map(candles.map((c) => [c.time, c]));
    const onMove = (param: MouseEventParams) => {
      setHover(param.time !== undefined ? (byTime.get(param.time as number) ?? null) : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [candles]);

  const shown = hover ?? candles.at(-1) ?? null;
  const up = shown ? shown.close >= shown.open : true;

  return (
    <div className="flex h-full w-full flex-col">
      {shown && (
        <div
          data-testid="ohlc"
          className="num flex h-5 shrink-0 items-center gap-x-2.5 overflow-hidden px-1 text-[11px] whitespace-nowrap text-slate-500 sm:gap-x-3 sm:text-xs dark:text-slate-400"
        >
          <span>
            {new Date(shown.time * 1000).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: '2-digit',
            })}
          </span>
          {(['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k}>
              {k[0]!.toUpperCase()}{' '}
              <span className={up ? 'text-up dark:text-green-400' : 'text-down dark:text-red-400'}>
                {formatPrice(shown[k])}
              </span>
            </span>
          ))}
          <span className="hidden sm:inline">
            Vol{' '}
            <span className="text-slate-700 dark:text-slate-200">{formatVolume(shown.volume)}</span>
          </span>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 w-full flex-1" />
    </div>
  );
}
