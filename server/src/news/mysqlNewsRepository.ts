import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { NewsRepository, SentArticle } from './newsRepository.js';

const SENT_NEWS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sent_news (
    article_key CHAR(64)     NOT NULL PRIMARY KEY,
    category    VARCHAR(32)  NOT NULL,
    title       TEXT         NOT NULL,
    link        TEXT         NOT NULL,
    sent_at     VARCHAR(32)  NOT NULL,
    INDEX sent_news_sent_at (sent_at)
  ) CHARACTER SET utf8mb4
`;

// วันที่ส่งสรุปข่าวสำเร็จแล้ว (ใช้กับระบบส่งย้อนหลัง)
const NEWS_RUNS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS news_runs (
    run_date CHAR(10)    NOT NULL PRIMARY KEY,
    sent_at  VARCHAR(32) NOT NULL
  ) CHARACTER SET utf8mb4
`;

/** เก็บประวัติข่าวที่ส่งแล้วใน MySQL (ตารางอยู่ฐานข้อมูลเดียวกับกฎแจ้งเตือน) */
export class MysqlNewsRepository implements NewsRepository {
  private constructor(private readonly pool: Pool) {}

  static async create(pool: Pool): Promise<MysqlNewsRepository> {
    await pool.query(SENT_NEWS_SCHEMA);
    await pool.query(NEWS_RUNS_SCHEMA);
    return new MysqlNewsRepository(pool);
  }

  async findSent(keys: string[]) {
    if (keys.length === 0) return new Set<string>();
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT article_key FROM sent_news WHERE article_key IN (?)',
      [keys],
    );
    return new Set(rows.map((r) => String(r.article_key)));
  }

  async markSent(articles: SentArticle[], at: Date) {
    if (articles.length === 0) return;
    const sentAt = at.toISOString();
    // INSERT IGNORE = ถ้ามี key นี้อยู่แล้วก็ข้ามไป ไม่ error
    await this.pool.query(
      'INSERT IGNORE INTO sent_news (article_key, category, title, link, sent_at) VALUES ?',
      [articles.map((a) => [a.key, a.category, a.title, a.link, sentAt])],
    );
  }

  async pruneBefore(before: Date) {
    const [result] = await this.pool.query<ResultSetHeader>(
      'DELETE FROM sent_news WHERE sent_at < ?',
      [before.toISOString()],
    );
    return result.affectedRows;
  }

  async hasDigestFor(localDate: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT 1 FROM news_runs WHERE run_date = ?',
      [localDate],
    );
    return rows.length > 0;
  }

  async markDigestSent(localDate: string, at: Date) {
    await this.pool.query('REPLACE INTO news_runs (run_date, sent_at) VALUES (?, ?)', [
      localDate,
      at.toISOString(),
    ]);
  }

  /** pool ปิดที่ db/index.ts */
  async close() {}
}
