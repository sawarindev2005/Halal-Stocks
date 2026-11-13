import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  type AlertCondition,
  type AlertRule,
  type CreateAlertInput,
  type UpdateAlertInput,
} from '@shared/types';

export const DEFAULT_ALERTS_DB_PATH = fileURLToPath(
  new URL('../../data/alerts.sqlite', import.meta.url),
);

export interface TriggerRecord {
  at: Date;
  price: number;
  marketTime: string | null;
}

/**
 * Storage for alert rules. Async so it can be backed by a network database (MySQL, see
 * mysqlAlertRepository.ts) as well as the built-in SQLite file.
 */
export interface AlertRepository {
  list(filter?: { symbol?: string; activeOnly?: boolean }): Promise<AlertRule[]>;
  get(id: number): Promise<AlertRule | undefined>;
  count(): Promise<number>;
  create(input: CreateAlertInput, now?: Date): Promise<AlertRule>;
  /** Resolves to undefined when the rule does not exist. */
  update(id: number, patch: UpdateAlertInput): Promise<AlertRule | undefined>;
  /** Resolves to false when the rule does not exist. */
  delete(id: number): Promise<boolean>;
  markTriggered(id: number, record: TriggerRecord): Promise<void>;
  close(): Promise<void>;
}

/**
 * Changing what the rule watches, or switching it back on, starts it fresh:
 * otherwise an old cooldown could silently swallow the first alert.
 */
export function needsTriggerReset(current: AlertRule, next: AlertRule): boolean {
  return (
    next.condition !== current.condition ||
    next.threshold !== current.threshold ||
    (next.active && !current.active)
  );
}

/** Column layout shared by the SQLite and MySQL tables. */
export interface AlertRow {
  id: number;
  symbol: string;
  condition: string;
  threshold: number;
  cooldown_minutes: number;
  active: number;
  created_at: string;
  last_triggered_at: string | null;
  last_triggered_price: number | null;
  last_market_time: string | null;
}

const SCHEMA_VERSION = 1;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS alerts (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol               TEXT    NOT NULL,
    condition            TEXT    NOT NULL
                         CHECK (condition IN ('price_above', 'price_below', 'change_up', 'change_down')),
    threshold            REAL    NOT NULL,
    cooldown_minutes     INTEGER NOT NULL,
    active               INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT    NOT NULL,
    last_triggered_at    TEXT,
    last_triggered_price REAL,
    last_market_time     TEXT
  );
  CREATE INDEX IF NOT EXISTS alerts_symbol ON alerts (symbol);
`;

export function toRule(row: AlertRow): AlertRule {
  return {
    id: row.id,
    symbol: row.symbol,
    condition: row.condition as AlertCondition,
    threshold: row.threshold,
    cooldownMinutes: row.cooldown_minutes,
    active: row.active === 1,
    createdAt: row.created_at,
    lastTriggeredAt: row.last_triggered_at,
    lastTriggeredPrice: row.last_triggered_price,
    lastTriggeredMarketTime: row.last_market_time,
  };
}

/**
 * Alert rules stored with Node's built-in SQLite (`node:sqlite`, no native build step).
 * Pass ':memory:' for tests.
 */
export class SqliteAlertRepository implements AlertRepository {
  private readonly db: DatabaseSync;

  constructor(path: string = DEFAULT_ALERTS_DB_PATH) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  async list({ symbol, activeOnly = false }: { symbol?: string; activeOnly?: boolean } = {}) {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (symbol) {
      where.push('symbol = ?');
      params.push(symbol);
    }
    if (activeOnly) where.push('active = 1');
    const sql = `SELECT * FROM alerts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
    return (this.db.prepare(sql).all(...params) as unknown as AlertRow[]).map(toRule);
  }

  async get(id: number) {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as unknown as
      AlertRow | undefined;
    return row ? toRule(row) : undefined;
  }

  async count() {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number };
    return row.n;
  }

  async create(input: CreateAlertInput, now: Date = new Date()) {
    const result = this.db
      .prepare(
        `INSERT INTO alerts (symbol, condition, threshold, cooldown_minutes, active, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(
        input.symbol,
        input.condition,
        input.threshold,
        input.cooldownMinutes ?? DEFAULT_ALERT_COOLDOWN_MINUTES,
        now.toISOString(),
      );
    return (await this.get(Number(result.lastInsertRowid)))!;
  }

  async update(id: number, patch: UpdateAlertInput) {
    const current = await this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    const reset = needsTriggerReset(current, next);

    this.db
      .prepare(
        `UPDATE alerts SET condition = ?, threshold = ?, cooldown_minutes = ?, active = ?
         ${reset ? ', last_triggered_at = NULL, last_triggered_price = NULL, last_market_time = NULL' : ''}
         WHERE id = ?`,
      )
      .run(next.condition, next.threshold, next.cooldownMinutes, next.active ? 1 : 0, id);
    return this.get(id);
  }

  async delete(id: number) {
    return this.db.prepare('DELETE FROM alerts WHERE id = ?').run(id).changes > 0;
  }

  async markTriggered(id: number, { at, price, marketTime }: TriggerRecord) {
    this.db
      .prepare(
        `UPDATE alerts SET last_triggered_at = ?, last_triggered_price = ?, last_market_time = ?
         WHERE id = ?`,
      )
      .run(at.toISOString(), price, marketTime, id);
  }

  async close() {
    this.db.close();
  }
}
