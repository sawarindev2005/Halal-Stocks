import type { Candle } from '@shared/types';

export interface LinePoint {
  time: number;
  value: number;
}

/**
 * Simple moving average of closing prices.
 * The first point is at index `period - 1`; shorter inputs return an empty array.
 * Runs in O(n) with a rolling sum.
 */
export function sma(candles: Candle[], period: number): LinePoint[] {
  if (!Number.isInteger(period) || period <= 0)
    throw new RangeError('period must be a positive integer');
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i]!.close;
    if (i >= period) sum -= candles[i - period]!.close;
    if (i >= period - 1) out.push({ time: candles[i]!.time, value: sum / period });
  }
  return out;
}

/** Highest high and lowest low of candles with `time >= fromTime`; null when none match. */
export function highLow(candles: Candle[], fromTime = -Infinity) {
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.time < fromTime) continue;
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return Number.isFinite(high) ? { high, low } : null;
}
