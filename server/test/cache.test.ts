import { describe, expect, it, vi } from 'vitest';
import { TTLCache } from '../src/lib/cache.js';

/** Controllable clock so TTL expiry is deterministic. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('TTLCache', () => {
  it('returns a stored value before the TTL expires', () => {
    const clock = fakeClock();
    const cache = new TTLCache<string>(60_000, clock.now);
    cache.set('AAPL', 'v1');
    clock.advance(59_999);
    expect(cache.get('AAPL')).toBe('v1');
  });

  it('expires values once the TTL has passed', () => {
    const clock = fakeClock();
    const cache = new TTLCache<string>(60_000, clock.now);
    cache.set('AAPL', 'v1');
    clock.advance(60_000);
    expect(cache.get('AAPL')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('getOrSet loads once and serves later calls from cache', async () => {
    const clock = fakeClock();
    const cache = new TTLCache<number>(1_000, clock.now);
    const load = vi.fn().mockResolvedValue(42);

    expect(await cache.getOrSet('k', load)).toBe(42);
    expect(await cache.getOrSet('k', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);

    clock.advance(1_000);
    await cache.getOrSet('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates concurrent loads of the same key', async () => {
    const cache = new TTLCache<number>(1_000);
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));

    const a = cache.getOrSet('k', load);
    const b = cache.getOrSet('k', load);
    resolve(7);

    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed loads', async () => {
    const cache = new TTLCache<number>(1_000);
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(1);

    await expect(cache.getOrSet('k', load)).rejects.toThrow('boom');
    expect(await cache.getOrSet('k', load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps keys independent', () => {
    const cache = new TTLCache<string>(1_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });
});
