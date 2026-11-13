import { describe, expect, it, vi } from 'vitest';
import type { AlertRule, Quote } from '@shared/types';
import {
  buildAlertMessage,
  createDiscordNotifier,
  NotifierError,
} from '../src/alerts/discordNotifier.js';

const URL = 'https://discord.com/api/webhooks/1/token';

function response(status: number, body?: unknown, headers?: Record<string, string>) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

describe('createDiscordNotifier', () => {
  it('posts JSON with our username and mentions disabled', async () => {
    const fetchFn = vi.fn(async () => response(204));
    await createDiscordNotifier(URL, { fetchFn }).send({ content: 'hi @everyone' });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'Shariah Stock Watch',
      allowed_mentions: { parse: [] },
      content: 'hi @everyone',
    });
  });

  it('waits and retries once when rate limited', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(429, { retry_after: 0.5 }))
      .mockResolvedValueOnce(response(204));
    const wait = vi.fn(async () => {});

    await createDiscordNotifier(URL, { fetchFn, wait }).send({ content: 'x' });

    expect(wait).toHaveBeenCalledWith(500);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('gives up on a long rate-limit wait', async () => {
    const fetchFn = vi.fn(async () => response(429, { retry_after: 60 }));
    const send = createDiscordNotifier(URL, { fetchFn, wait: vi.fn() }).send({ content: 'x' });
    await expect(send).rejects.toThrow(/rate limit/);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('explains a deleted or mistyped webhook', async () => {
    const fetchFn = vi.fn(async () => response(404, { message: 'Unknown Webhook' }));
    const send = createDiscordNotifier(URL, { fetchFn }).send({ content: 'x' });
    await expect(send).rejects.toMatchObject({
      name: 'NotifierError',
      status: 404,
      message: expect.stringMatching(/webhook URL/),
    });
  });

  it('wraps network errors', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const send = createDiscordNotifier(URL, { fetchFn }).send({ content: 'x' });
    await expect(send).rejects.toBeInstanceOf(NotifierError);
    await expect(send).rejects.toThrow('Could not reach Discord: fetch failed');
  });
});

describe('buildAlertMessage', () => {
  const rule: AlertRule = {
    id: 1,
    symbol: 'ADVANC.BK',
    condition: 'change_up',
    threshold: 3,
    cooldownMinutes: 60,
    active: true,
    createdAt: '2026-10-19T00:00:00.000Z',
    lastTriggeredAt: null,
    lastTriggeredPrice: null,
    lastTriggeredMarketTime: null,
  };
  const quote: Quote = {
    symbol: 'ADVANC.BK',
    price: 312,
    change: 10,
    changePercent: 3.31,
    volume: 1,
    previousClose: 302,
    currency: 'THB',
    marketState: 'REGULAR',
    marketTime: '2026-10-19T08:00:00.000Z',
  };

  it('describes the rule, price and change, and links to the stock page', () => {
    const embed = buildAlertMessage(rule, quote, {
      appUrl: 'http://localhost:5173',
      stock: {
        symbol: 'ADVANC.BK',
        name: 'Advanced Info Service',
        market: 'TH',
        sector: 'Telecom',
        screenedBy: 'x',
        updatedAt: '2026-01-01',
      },
    }).embeds![0]!;

    expect(embed.title).toBe('📈 ADVANC.BK วันนี้ขึ้นเกิน 3.00%');
    expect(embed.url).toBe('http://localhost:5173/stock/ADVANC.BK');
    expect(embed.description).toBe('Advanced Info Service');
    expect(embed.fields).toEqual([
      { name: 'ราคาล่าสุด', value: '312.00 THB', inline: true },
      { name: 'เปลี่ยนแปลงวันนี้', value: '+10.00 (+3.31%)', inline: true },
    ]);
    expect(embed.timestamp).toBe('2026-10-19T08:00:00.000Z');
  });

  it('uses the down style for falling conditions', () => {
    const embed = buildAlertMessage({ ...rule, condition: 'price_below', threshold: 320 }, quote)
      .embeds![0]!;
    expect(embed.title).toBe('📉 ADVANC.BK ราคาต่ำกว่า 320.00');
    expect(embed.url).toBeUndefined();
  });
});
