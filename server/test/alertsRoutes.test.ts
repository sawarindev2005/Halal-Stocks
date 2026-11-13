import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertCheckSummary, Stock } from '@shared/types';
import type { AlertChecker } from '../src/alerts/alertChecker.js';
import { SqliteAlertRepository } from '../src/alerts/alertRepository.js';
import { NotifierError, type Notifier } from '../src/alerts/discordNotifier.js';
import { createApp } from '../src/app.js';
import type { PriceService } from '../src/services/priceService.js';
import type { ShariahRepository } from '../src/services/shariahService.js';

const STOCKS: Stock[] = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    market: 'US',
    sector: 'Technology',
    screenedBy: 'Test',
    updatedAt: '2026-01-01',
  },
];

const shariah: ShariahRepository = {
  list: async () => STOCKS,
  get: async (symbol) => STOCKS.find((s) => s.symbol === symbol),
};

const prices: PriceService = { getQuotes: vi.fn(), getHistory: vi.fn() };

const SUMMARY: AlertCheckSummary = {
  startedAt: '2026-10-19T15:00:00.000Z',
  finishedAt: '2026-10-19T15:00:01.000Z',
  checked: 1,
  triggered: 1,
  skippedReason: null,
  errors: [],
};

let repo: SqliteAlertRepository;
let notifier: Notifier & { send: ReturnType<typeof vi.fn> };
let checker: AlertChecker & { runOnce: ReturnType<typeof vi.fn> };

function app({ withWebhook = true } = {}) {
  return createApp({
    clientOrigin: 'http://localhost:5173',
    shariah,
    prices,
    alerts: {
      repo,
      checker,
      notifier: withWebhook ? notifier : null,
      schedule: {
        expression: '*/5 * * * *',
        nextRun: () => new Date('2026-10-19T15:05:00.000Z'),
      },
    },
  });
}

beforeEach(() => {
  repo = new SqliteAlertRepository(':memory:');
  notifier = { send: vi.fn(async () => {}) };
  checker = { runOnce: vi.fn(async () => SUMMARY), lastCheck: () => null };
});
afterEach(() => repo.close());

const create = (body: object) => request(app()).post('/api/alerts').send(body);

describe('POST /api/alerts', () => {
  it('creates a rule with the default cooldown', async () => {
    const res = await create({ symbol: 'nvda', condition: 'price_below', threshold: 200 });
    expect(res.status).toBe(201);
    expect(res.body.alert).toMatchObject({
      id: 1,
      symbol: 'NVDA',
      condition: 'price_below',
      threshold: 200,
      cooldownMinutes: 1440,
      active: true,
    });
  });

  it('rejects a symbol that is not in the Shariah list', async () => {
    const res = await create({ symbol: 'TSLA', condition: 'price_below', threshold: 200 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_SYMBOL');
  });

  it.each([
    [{ symbol: 'NVDA', condition: 'price_below', threshold: 0 }, 'threshold'],
    [{ symbol: 'NVDA', condition: 'price_below', threshold: '200' }, 'threshold'],
    [{ symbol: 'NVDA', condition: 'cross_ma', threshold: 200 }, 'condition'],
    [{ symbol: 'NVDA', condition: 'change_down', threshold: 150 }, 'threshold'],
    [
      { symbol: 'NVDA', condition: 'price_below', threshold: 1, cooldownMinutes: 0 },
      'cooldownMinutes',
    ],
  ])('validates %o', async (body, path) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });

  it('rejects unknown fields', async () => {
    const res = await create({ symbol: 'NVDA', condition: 'price_below', threshold: 1, id: 7 });
    expect(res.status).toBe(400);
  });

  it('answers malformed JSON with a readable 400', async () => {
    const res = await request(app())
      .post('/api/alerts')
      .set('Content-Type', 'application/json')
      .send('{"symbol":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /api/alerts', () => {
  it('lists rules, optionally for one symbol', async () => {
    await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    await repo.create({ symbol: 'AAPL', condition: 'price_above', threshold: 300 });

    expect((await request(app()).get('/api/alerts')).body.alerts).toHaveLength(2);
    const res = await request(app()).get('/api/alerts?symbol=nvda');
    expect(res.body.alerts.map((a: { symbol: string }) => a.symbol)).toEqual(['NVDA']);
  });
});

describe('PATCH /api/alerts/:id', () => {
  it('updates a rule', async () => {
    const { id } = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    const res = await request(app()).patch(`/api/alerts/${id}`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.alert.active).toBe(false);
  });

  it('checks the merged rule (threshold over 100% on a change_down rule)', async () => {
    const { id } = await repo.create({ symbol: 'NVDA', condition: 'change_down', threshold: 5 });
    const res = await request(app()).patch(`/api/alerts/${id}`).send({ threshold: 120 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('threshold');
  });

  it('requires at least one field', async () => {
    const { id } = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    expect((await request(app()).patch(`/api/alerts/${id}`).send({})).status).toBe(400);
  });

  it('returns 404 for a missing rule and 400 for a bad id', async () => {
    const missing = await request(app()).patch('/api/alerts/99').send({ active: false });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ALERT_NOT_FOUND');
    expect((await request(app()).patch('/api/alerts/abc').send({ active: false })).status).toBe(
      400,
    );
  });
});

describe('DELETE /api/alerts/:id', () => {
  it('deletes a rule, then 404s', async () => {
    const { id } = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    expect((await request(app()).delete(`/api/alerts/${id}`)).status).toBe(204);
    expect((await request(app()).delete(`/api/alerts/${id}`)).status).toBe(404);
  });
});

describe('GET /api/alerts/status', () => {
  it('reports webhook and schedule', async () => {
    const res = await request(app()).get('/api/alerts/status');
    expect(res.body).toEqual({
      webhookConfigured: true,
      schedule: '*/5 * * * *',
      nextCheckAt: '2026-10-19T15:05:00.000Z',
      lastCheck: null,
    });
    const without = await request(app({ withWebhook: false })).get('/api/alerts/status');
    expect(without.body.webhookConfigured).toBe(false);
  });
});

describe('POST /api/alerts/test', () => {
  it('sends a test message', async () => {
    const res = await request(app()).post('/api/alerts/test');
    expect(res.status).toBe(200);
    expect(notifier.send).toHaveBeenCalledOnce();
  });

  it('returns 409 without a webhook', async () => {
    const res = await request(app({ withWebhook: false })).post('/api/alerts/test');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  it('returns 502 with the reason when Discord refuses', async () => {
    notifier.send.mockRejectedValue(new NotifierError('Discord rejected the webhook URL', 404));
    const res = await request(app()).post('/api/alerts/test');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({
      code: 'DISCORD_ERROR',
      message: 'Discord rejected the webhook URL',
    });
  });
});

describe('POST /api/alerts/check', () => {
  it('runs the checker now and returns its summary', async () => {
    const res = await request(app()).post('/api/alerts/check');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(SUMMARY);
    expect(checker.runOnce).toHaveBeenCalledOnce();
  });
});
