import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  type CreateAlertInput,
  type UpdateAlertInput,
} from '@shared/types';
import {
  needsTriggerReset,
  toRule,
  type AlertRepository,
  type AlertRow,
  type TriggerRecord,
} from './alertRepository.js';

// ตารางเดียวกับฝั่ง SQLite — เวลาเก็บเป็นข้อความ ISO เพื่อให้ได้ค่าเหมือนกันทั้งสองแบบ
// `condition` เป็นคำสงวนของ MySQL จึงต้องครอบด้วย backtick
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS alerts (
    id                   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    symbol               VARCHAR(20)  NOT NULL,
    \`condition\`        VARCHAR(20)  NOT NULL,
    threshold            DOUBLE       NOT NULL,
    cooldown_minutes     INT          NOT NULL,
    active               TINYINT(1)   NOT NULL DEFAULT 1,
    created_at           VARCHAR(32)  NOT NULL,
    last_triggered_at    VARCHAR(32)  NULL,
    last_triggered_price DOUBLE       NULL,
    last_market_time     VARCHAR(32)  NULL,
    INDEX alerts_symbol (symbol),
    CONSTRAINT alerts_condition_check
      CHECK (\`condition\` IN ('price_above', 'price_below', 'change_up', 'change_down'))
  ) CHARACTER SET utf8mb4
`;

type Row = AlertRow & RowDataPacket;

/** เก็บกฎแจ้งเตือนใน MySQL — ใช้แทน SqliteAlertRepository ได้ทันที (interface เดียวกัน) */
export class MysqlAlertRepository implements AlertRepository {
  private constructor(private readonly pool: Pool) {}

  /** สร้าง repository และสร้างตารางถ้ายังไม่มี */
  static async create(pool: Pool): Promise<MysqlAlertRepository> {
    await pool.query(SCHEMA);
    return new MysqlAlertRepository(pool);
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
    const [rows] = await this.pool.query<Row[]>(sql, params);
    return rows.map(toRule);
  }

  async get(id: number) {
    const [rows] = await this.pool.query<Row[]>('SELECT * FROM alerts WHERE id = ?', [id]);
    return rows[0] ? toRule(rows[0]) : undefined;
  }

  async count() {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM alerts');
    return Number(rows[0]?.n ?? 0);
  }

  async create(input: CreateAlertInput, now: Date = new Date()) {
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO alerts (symbol, \`condition\`, threshold, cooldown_minutes, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [
        input.symbol,
        input.condition,
        input.threshold,
        input.cooldownMinutes ?? DEFAULT_ALERT_COOLDOWN_MINUTES,
        now.toISOString(),
      ],
    );
    return (await this.get(result.insertId))!;
  }

  async update(id: number, patch: UpdateAlertInput) {
    const current = await this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    const reset = needsTriggerReset(current, next);

    await this.pool.query(
      `UPDATE alerts SET \`condition\` = ?, threshold = ?, cooldown_minutes = ?, active = ?
       ${reset ? ', last_triggered_at = NULL, last_triggered_price = NULL, last_market_time = NULL' : ''}
       WHERE id = ?`,
      [next.condition, next.threshold, next.cooldownMinutes, next.active ? 1 : 0, id],
    );
    return this.get(id);
  }

  async delete(id: number) {
    const [result] = await this.pool.query<ResultSetHeader>('DELETE FROM alerts WHERE id = ?', [
      id,
    ]);
    return result.affectedRows > 0;
  }

  async markTriggered(id: number, { at, price, marketTime }: TriggerRecord) {
    await this.pool.query(
      `UPDATE alerts SET last_triggered_at = ?, last_triggered_price = ?, last_market_time = ?
       WHERE id = ?`,
      [at.toISOString(), price, marketTime, id],
    );
  }

  /** pool ใช้ร่วมกับส่วนอื่น จึงปิดที่ตัวสร้าง (db/index.ts) แทน */
  async close() {}
}
