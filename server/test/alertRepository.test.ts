import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteAlertRepository } from '../src/alerts/alertRepository.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');

describe('SqliteAlertRepository', () => {
  let repo: SqliteAlertRepository;
  beforeEach(() => {
    repo = new SqliteAlertRepository(':memory:');
  });
  afterEach(() => repo.close());

  it('creates a rule with defaults', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 }, NOW);
    expect(r).toEqual({
      id: 1,
      symbol: 'NVDA',
      condition: 'price_below',
      threshold: 200,
      cooldownMinutes: 1440,
      active: true,
      createdAt: NOW.toISOString(),
      lastTriggeredAt: null,
      lastTriggeredPrice: null,
      lastTriggeredMarketTime: null,
    });
  });

  it('lists by symbol and active state', async () => {
    await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    const aapl = await repo.create({ symbol: 'AAPL', condition: 'change_up', threshold: 3 });
    await repo.create({ symbol: 'AAPL', condition: 'change_down', threshold: 3 });
    await repo.update(aapl.id, { active: false });

    expect(await repo.list()).toHaveLength(3);
    expect(await repo.list({ symbol: 'AAPL' })).toHaveLength(2);
    expect((await repo.list({ symbol: 'AAPL', activeOnly: true })).map((r) => r.condition)).toEqual(
      ['change_down'],
    );
    expect(await repo.count()).toBe(3);
  });

  it('updates fields and returns undefined for a missing id', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    expect(await repo.update(r.id, { threshold: 180, cooldownMinutes: 60 })).toMatchObject({
      threshold: 180,
      cooldownMinutes: 60,
    });
    expect(await repo.update(999, { active: false })).toBeUndefined();
  });

  it('records a trigger', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    await repo.markTriggered(r.id, {
      at: NOW,
      price: 190.5,
      marketTime: '2026-10-19T14:55:00.000Z',
    });
    expect(await repo.get(r.id)).toMatchObject({
      lastTriggeredAt: NOW.toISOString(),
      lastTriggeredPrice: 190.5,
      lastTriggeredMarketTime: '2026-10-19T14:55:00.000Z',
    });
  });

  it('starts a rule fresh when its condition changes or it is switched back on', async () => {
    const trigger = (id: number) =>
      repo.markTriggered(id, { at: NOW, price: 190, marketTime: NOW.toISOString() });
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });

    await trigger(r.id);
    expect((await repo.update(r.id, { cooldownMinutes: 60 }))!.lastTriggeredAt).not.toBeNull();
    expect((await repo.update(r.id, { active: false }))!.lastTriggeredAt).not.toBeNull();
    expect((await repo.update(r.id, { active: true }))!.lastTriggeredAt).toBeNull();

    await trigger(r.id);
    expect((await repo.update(r.id, { threshold: 180 }))!.lastTriggeredAt).toBeNull();
  });

  it('deletes rules', async () => {
    const r = await repo.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
    expect(await repo.delete(r.id)).toBe(true);
    expect(await repo.delete(r.id)).toBe(false);
    expect(await repo.get(r.id)).toBeUndefined();
  });

  it('rejects an unknown condition at the database level', async () => {
    await expect(
      repo.create({ symbol: 'NVDA', condition: 'bogus' as never, threshold: 1 }),
    ).rejects.toThrow(/CHECK constraint/);
  });
});

describe('SqliteAlertRepository on disk', () => {
  it('keeps rules across restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alerts-'));
    const file = join(dir, 'alerts.sqlite');
    try {
      const first = new SqliteAlertRepository(file);
      await first.create({ symbol: 'NVDA', condition: 'price_below', threshold: 200 });
      await first.close();

      const second = new SqliteAlertRepository(file);
      expect((await second.list()).map((r) => r.symbol)).toEqual(['NVDA']);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
