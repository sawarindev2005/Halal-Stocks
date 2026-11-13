import type { Candle } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { highLow, sma } from '../lib/indicators';

/** Candles with the given closes, one day apart; high/low = close ± 1. */
function candles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));
}

describe('sma', () => {
  it('averages closing prices over the period', () => {
    const data = candles([1, 2, 3, 4, 5]);
    expect(sma(data, 3).map((p) => p.value)).toEqual([2, 3, 4]);
  });

  it('aligns each point with the last candle of its window', () => {
    const data = candles([1, 2, 3, 4, 5]);
    expect(sma(data, 3).map((p) => p.time)).toEqual([data[2]!.time, data[3]!.time, data[4]!.time]);
  });

  it('period 1 returns the closes unchanged', () => {
    expect(sma(candles([5, 7, 9]), 1).map((p) => p.value)).toEqual([5, 7, 9]);
  });

  it('returns an empty array when there is not enough data', () => {
    expect(sma(candles([1, 2]), 3)).toEqual([]);
    expect(sma([], 20)).toEqual([]);
  });

  it('matches a naive average on a long series (rolling sum stays accurate)', () => {
    const closes = Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.01);
    const result = sma(candles(closes), 200);
    expect(result).toHaveLength(301);
    const last = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    expect(result.at(-1)!.value).toBeCloseTo(last, 9);
  });

  it('rejects invalid periods', () => {
    expect(() => sma(candles([1, 2, 3]), 0)).toThrow(RangeError);
    expect(() => sma(candles([1, 2, 3]), 2.5)).toThrow(RangeError);
  });
});

describe('highLow', () => {
  it('finds the highest high and lowest low', () => {
    expect(highLow(candles([10, 30, 20]))).toEqual({ high: 31, low: 9 });
  });

  it('only considers candles from the given time', () => {
    const data = candles([10, 30, 20, 15]);
    expect(highLow(data, data[2]!.time)).toEqual({ high: 21, low: 14 });
  });

  it('returns null when no candle matches', () => {
    expect(highLow([])).toBeNull();
  });
});
