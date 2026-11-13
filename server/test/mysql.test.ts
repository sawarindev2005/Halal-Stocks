/**
 * ทดสอบกับ MySQL จริง — ข้ามไปอัตโนมัติถ้าไม่ได้ตั้ง TEST_MYSQL_URL
 *   TEST_MYSQL_URL=mysql://root:pass@localhost:3306/test npm --prefix server test -- test/mysql.test.ts
 * ⚠️ ใช้ฐานข้อมูลสำหรับทดสอบเท่านั้น — test จะลบข้อมูลในตาราง alerts และ sent_news
 */
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MysqlAlertRepository } from '../src/alerts/mysqlAlertRepository.js';
import { createMysqlPool } from '../src/db/mysql.js';
import { MysqlNewsRepository } from '../src/news/mysqlNewsRepository.js';

const url = process.env.TEST_MYSQL_URL;
const NOW = new Date('2026-10-19T15:00:00.000Z');

describe.skipIf(!url)('MySQL repositories', () => {
  let pool: Pool;
  let alerts: MysqlAlertRepository;
  let news: MysqlNewsRepository;

  beforeAll(async () => {
    pool = await createMysqlPool(url!);
    alerts = await MysqlAlertRepository.create(pool);
    news = await MysqlNewsRepository.create(pool);
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE alerts');
    await pool.query('TRUNCATE TABLE sent_news');
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('stores alert rules like the SQLite repository', async () => {
    const r = await alerts.create(
      { symbol: 'NVDA', condition: 'price_below', threshold: 200 },
      NOW,
    );
    expect(r).toEqual({
      id: r.id,
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

    await alerts.markTriggered(r.id, { at: NOW, price: 190.5, marketTime: NOW.toISOString() });
    expect((await alerts.update(r.id, { cooldownMinutes: 60 }))!.lastTriggeredPrice).toBe(190.5);
    expect((await alerts.update(r.id, { threshold: 180 }))!.lastTriggeredAt).toBeNull();

    await alerts.create({ symbol: 'AAPL', condition: 'change_up', threshold: 3 });
    expect(await alerts.count()).toBe(2);
    expect(await alerts.list({ symbol: 'AAPL', activeOnly: true })).toHaveLength(1);
    expect(await alerts.delete(r.id)).toBe(true);
    expect(await alerts.get(r.id)).toBeUndefined();
  });

  it('rejects an unknown condition', async () => {
    await expect(
      alerts.create({ symbol: 'NVDA', condition: 'bogus' as never, threshold: 1 }),
    ).rejects.toThrow();
  });

  it('remembers sent news (Thai titles included) and prunes old history', async () => {
    const a = {
      key: 'a'.repeat(64),
      title: 'ข่าวหุ้นไทย 📈',
      link: 'https://x',
      category: 'markets',
    };
    await news.markSent([a], new Date('2026-10-01T00:00:00Z'));
    await news.markSent([a, { ...a, key: 'b'.repeat(64) }], NOW);

    expect(await news.findSent([a.key, 'b'.repeat(64), 'c'.repeat(64)])).toEqual(
      new Set([a.key, 'b'.repeat(64)]),
    );
    const [rows] = await pool.query('SELECT title FROM sent_news WHERE article_key = ?', [a.key]);
    expect(rows).toEqual([{ title: 'ข่าวหุ้นไทย 📈' }]);
    expect(await news.pruneBefore(new Date('2026-10-15T00:00:00Z'))).toBe(1);

    await pool.query('TRUNCATE TABLE news_runs');
    expect(await news.hasDigestFor('2026-10-30')).toBe(false);
    await news.markDigestSent('2026-10-30', NOW);
    await news.markDigestSent('2026-10-30', NOW);
    expect(await news.hasDigestFor('2026-10-30')).toBe(true);
  });
});
