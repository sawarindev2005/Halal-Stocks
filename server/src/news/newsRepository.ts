import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const DEFAULT_NEWS_DB_PATH = fileURLToPath(
  new URL('../../data/news.sqlite', import.meta.url),
);

/** ข่าวหนึ่งชิ้นที่ส่งเข้า Discord ไปแล้ว */
export interface SentArticle {
  /** รหัสข่าว (hash ของลิงก์) — ใช้เช็กว่าเคยส่งหรือยัง */
  key: string;
  title: string;
  link: string;
  category: string;
}

/** ที่เก็บประวัติข่าวที่ส่งแล้ว เพื่อไม่ให้ส่งข่าวซ้ำในวันถัดไป */
export interface NewsRepository {
  /** จาก key ที่ให้มา คืนเฉพาะตัวที่เคยส่งไปแล้ว */
  findSent(keys: string[]): Promise<Set<string>>;
  markSent(articles: SentArticle[], at: Date): Promise<void>;
  /** ลบประวัติที่เก่ากว่า `before` ไม่ให้ตารางโตไปเรื่อย ๆ คืนจำนวนที่ลบ */
  pruneBefore(before: Date): Promise<number>;
  /** วันนี้ (YYYY-MM-DD ตามเวลาไทย) ส่งสรุปข่าวสำเร็จไปแล้วหรือยัง — ใช้กับระบบส่งย้อนหลัง */
  hasDigestFor(localDate: string): Promise<boolean>;
  markDigestSent(localDate: string, at: Date): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sent_news (
    article_key TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    link        TEXT NOT NULL,
    sent_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sent_news_sent_at ON sent_news (sent_at);
  CREATE TABLE IF NOT EXISTS news_runs (
    run_date TEXT PRIMARY KEY,
    sent_at  TEXT NOT NULL
  );
`;

/** เก็บประวัติข่าวในไฟล์ SQLite (ใช้ตอนรันในเครื่องโดยไม่มี MySQL และใน test ด้วย ':memory:') */
export class SqliteNewsRepository implements NewsRepository {
  private readonly db: DatabaseSync;

  constructor(path: string = DEFAULT_NEWS_DB_PATH) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  async findSent(keys: string[]) {
    if (keys.length === 0) return new Set<string>();
    const placeholders = keys.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT article_key FROM sent_news WHERE article_key IN (${placeholders})`)
      .all(...keys) as { article_key: string }[];
    return new Set(rows.map((r) => r.article_key));
  }

  async markSent(articles: SentArticle[], at: Date) {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO sent_news (article_key, category, title, link, sent_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const a of articles) insert.run(a.key, a.category, a.title, a.link, at.toISOString());
  }

  async pruneBefore(before: Date) {
    const result = this.db
      .prepare('DELETE FROM sent_news WHERE sent_at < ?')
      .run(before.toISOString());
    return Number(result.changes);
  }

  async hasDigestFor(localDate: string) {
    return (
      this.db.prepare('SELECT 1 FROM news_runs WHERE run_date = ?').get(localDate) !== undefined
    );
  }

  async markDigestSent(localDate: string, at: Date) {
    this.db
      .prepare('INSERT OR REPLACE INTO news_runs (run_date, sent_at) VALUES (?, ?)')
      .run(localDate, at.toISOString());
  }

  async close() {
    this.db.close();
  }
}
