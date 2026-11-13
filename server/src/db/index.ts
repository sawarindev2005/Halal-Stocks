import { MysqlAlertRepository } from '../alerts/mysqlAlertRepository.js';
import { SqliteAlertRepository, type AlertRepository } from '../alerts/alertRepository.js';
import { MysqlNewsRepository } from '../news/mysqlNewsRepository.js';
import { SqliteNewsRepository, type NewsRepository } from '../news/newsRepository.js';
import { createMysqlPool } from './mysql.js';

export interface Repositories {
  /** 'mysql' เมื่อตั้ง DATABASE_URL, ไม่งั้นใช้ไฟล์ SQLite ใน server/data */
  kind: 'mysql' | 'sqlite';
  alerts: AlertRepository;
  news: NewsRepository;
  close(): Promise<void>;
}

export interface DatabaseConfig {
  DATABASE_URL?: string;
  ALERTS_DB_PATH: string;
  NEWS_DB_PATH: string;
}

/**
 * เลือกฐานข้อมูลจาก config จุดเดียว:
 * - มี DATABASE_URL (mysql://...) → ใช้ MySQL (แบบที่ docker compose ตั้งไว้ให้)
 * - ไม่มี → ใช้ไฟล์ SQLite เหมือนเดิม (รัน `npm run dev` ในเครื่องได้โดยไม่ต้องติดตั้ง MySQL)
 */
export async function openRepositories(config: DatabaseConfig): Promise<Repositories> {
  if (config.DATABASE_URL) {
    const pool = await createMysqlPool(config.DATABASE_URL);
    return {
      kind: 'mysql',
      alerts: await MysqlAlertRepository.create(pool),
      news: await MysqlNewsRepository.create(pool),
      close: () => pool.end(),
    };
  }

  const alerts = new SqliteAlertRepository(config.ALERTS_DB_PATH);
  const news = new SqliteNewsRepository(config.NEWS_DB_PATH);
  return {
    kind: 'sqlite',
    alerts,
    news,
    close: async () => {
      await alerts.close();
      await news.close();
    },
  };
}
