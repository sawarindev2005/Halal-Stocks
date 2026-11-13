import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertRule, Quote, QuoteResult } from '@shared/types';
import { createAlertChecker, isConditionMet, shouldTrigger } from '../src/alerts/alertChecker.js';
import { SqliteAlertRepository } from '../src/alerts/alertRepository.js';
import type { DiscordMessage, Notifier } from '../src/alerts/discordNotifier.js';
import type { PriceService } from '../src/services/priceService.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');
const MINUTE = 60_000;

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    symbol: 'NVDA',
    price: 190,
    change: -12,
    changePercent: -6,
    volume: 1000,
    previousClose: 202,
    currency: 'USD',
    marketState: 'REGULAR',
    marketTime: '2026-10-19T14:55:00.000Z',
    ...overrides,
  };
}

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 1,
    symbol: 'NVDA',
    condition: 'price_below',
    threshold: 200,
    cooldownMinutes: 60,
    active: true,
    createdAt: '2026-10-19T00:00:00.000Z',
    lastTriggeredAt: null,
    lastTriggeredPrice: null,
    lastTriggeredMarketTime: null,
    ...overrides,
  };
}

describe('isConditionMet', () => {
  it.each([
    ['price_above', 200, { price: 201 }, true],
    ['price_above', 200, { price: 200 }, false],
    ['price_below', 200, { price: 199 }, true],
    ['price_below', 200, { price: 200 }, false],
    ['change_up', 5, { changePercent: 5 }, true],
    ['change_up', 5, { changePercent: 4.9 }, false],
    ['change_down', 5, { changePercent: -5 }, true],
    ['change_down', 5, { changePercent: -4.9 }, false],
    ['change_down', 5, { changePercent: 6 }, false],
  ] as const)('%s %d with %o → %s', (condition, threshold, q, expected) => {
    expect(isConditionMet({ condition, threshold }, quote(q))).toBe(expected);
  });
});

describe('shouldTrigger', () => {
  it('fires when the condition is met and the rule never fired', () => {
    expect(shouldTrigger(rule(), quote(), NOW)).toBe(true);
  });

  it('does not fire for an inactive rule', () => {
    expect(shouldTrigger(rule({ active: false }), quote(), NOW)).toBe(false);
  });

  it('waits for the cooldown to pass', () => {
    const fired = (minutesAgo: number) =>
      rule({
        lastTriggeredAt: new Date(NOW.getTime() - minutesAgo * MINUTE).toISOString(),
        lastTriggeredMarketTime: '2026-10-19T13:00:00.000Z',
      });
    expect(shouldTrigger(fired(59), quote(), NOW)).toBe(false);
    expect(shouldTrigger(fired(60), quote(), NOW)).toBe(true);
  });

  it('does not re-fire on the same stale quote once the cooldown ends (closed market)', () => {
    const r = rule({
      lastTriggeredAt: '2026-10-17T20:00:00.000Z', // two days ago, cooldown long over
      lastTriggeredMarketTime: '2026-10-17T20:00:00.000Z',
    });
    expect(shouldTrigger(r, quote({ marketTime: '2026-10-17T20:00:00.000Z' }), NOW)).toBe(false);
    expect(shouldTrigger(r, quote({ marketTime: '2026-10-19T14:55:00.000Z' }), NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function fakePrices(results: QuoteResult[]) {
  return {
    getQuotes: vi.fn(async (symbols: string[]) =>
      results.filter((r) => symbols.includes(r.symbol)),
    ),
    getHistory: vi.fn(),
  } satisfies PriceService;
}

function fakeNotifier() {
  const sent: DiscordMessage[] = [];
  return {
    sent,
    send: vi.fn(async (m: DiscordMessage) => {
      sent.push(m);
    }),
  } satisfies Notifier & { sent: DiscordMessage[] };
}

describe('createAlertChecker', () => {
  let repo: SqliteAlertRepository;
  let clock: Date;
  beforeEach(() => {
    repo = new SqliteAlertRepository(':memory:');
    clock = NOW;
  });
  afterEach(() => repo.close());

  const ok = (q: Quote): QuoteResult => ({ symbol: q.symbol, ok: true, quote: q });

  it('sends one message per triggered rule and records the trigger', async () => {
    const hit = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    await repo.create({ symbol: 'NVDA', condition: 'price_above', threshold: 300 }); // not met
    const notifier = fakeNotifier();
    const prices = fakePrices([ok(quote())]);
    const checker = createAlertChecker({ repo, prices, notifier, now: () => clock });

    const summary = await checker.runOnce();

    expect(summary).toMatchObject({ checked: 2, triggered: 1, skippedReason: null, errors: [] });
    expect(prices.getQuotes).toHaveBeenCalledWith(['NVDA']); // de-duplicated
    expect(notifier.sent[0]!.embeds![0]!.title).toContain('NVDA ราคาต่ำกว่า 200.00');
    expect(await repo.get(hit.id)).toMatchObject({
      lastTriggeredAt: NOW.toISOString(),
      lastTriggeredPrice: 190,
      lastTriggeredMarketTime: '2026-10-19T14:55:00.000Z',
    });
    expect(checker.lastCheck()).toEqual(summary);
  });

  it('does not repeat a notification within the cooldown', async () => {
    await repo.create({
      symbol: 'NVDA',
      condition: 'price_below',
      threshold: 200,
      cooldownMinutes: 60,
    });
    const notifier = fakeNotifier();
    let marketTime = '2026-10-19T14:55:00.000Z';
    const prices = {
      getQuotes: vi.fn(async () => [ok(quote({ marketTime }))]),
      getHistory: vi.fn(),
    } satisfies PriceService;
    const checker = createAlertChecker({ repo, prices, notifier, now: () => clock });

    await checker.runOnce();
    clock = new Date(NOW.getTime() + 30 * MINUTE);
    marketTime = '2026-10-19T15:25:00.000Z';
    await checker.runOnce();
    expect(notifier.send).toHaveBeenCalledTimes(1);

    clock = new Date(NOW.getTime() + 61 * MINUTE);
    marketTime = '2026-10-19T15:56:00.000Z';
    await checker.runOnce();
    expect(notifier.send).toHaveBeenCalledTimes(2);
  });

  it('keeps the rule un-triggered when Discord fails, so the next pass retries', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    const notifier: Notifier = { send: vi.fn().mockRejectedValue(new Error('Discord down')) };
    const checker = createAlertChecker({ repo, prices: fakePrices([ok(quote())]), notifier });

    const summary = await checker.runOnce();

    expect(summary.triggered).toBe(0);
    expect(summary.errors).toEqual([{ symbol: 'NVDA', alertId: r.id, message: 'Discord down' }]);
    expect((await await repo.get(r.id))!.lastTriggeredAt).toBeNull();
  });

  it('reports symbols whose quote failed and still checks the others', async () => {
    await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    await repo.create({ symbol: 'AAPL', condition: 'price_above', threshold: 1 });
    const notifier = fakeNotifier();
    const prices = fakePrices([
      ok(quote()),
      { symbol: 'AAPL', ok: false, error: 'socket hang up' },
    ]);

    const summary = await createAlertChecker({ repo, prices, notifier }).runOnce();

    expect(summary.triggered).toBe(1);
    expect(summary.errors).toEqual([{ symbol: 'AAPL', message: 'socket hang up' }]);
  });

  it('skips the pass when no webhook is configured', async () => {
    await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    const prices = fakePrices([ok(quote())]);

    const summary = await createAlertChecker({ repo, prices, notifier: null }).runOnce();

    expect(summary.skippedReason).toMatch(/DISCORD_WEBHOOK_URL/);
    expect(prices.getQuotes).not.toHaveBeenCalled();
  });

  it('does not fetch prices when there are no active rules', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    await repo.update(r.id, { active: false });
    const prices = fakePrices([ok(quote())]);

    await createAlertChecker({ repo, prices, notifier: fakeNotifier() }).runOnce();

    expect(prices.getQuotes).not.toHaveBeenCalled();
  });

  it('joins an in-progress pass instead of sending twice', async () => {
    await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    const notifier = fakeNotifier();
    const checker = createAlertChecker({ repo, prices: fakePrices([ok(quote())]), notifier });

    const [a, b] = await Promise.all([checker.runOnce(), checker.runOnce()]);

    expect(a).toBe(b);
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  it('never rejects, even when the repository throws', async () => {
    const broken = {
      list: () => {
        throw new Error('database is locked');
      },
    } as unknown as SqliteAlertRepository;

    const summary = await createAlertChecker({
      repo: broken,
      prices: fakePrices([]),
      notifier: fakeNotifier(),
    }).runOnce();

    expect(summary.errors).toEqual([{ symbol: '*', message: 'database is locked' }]);
  });
});
