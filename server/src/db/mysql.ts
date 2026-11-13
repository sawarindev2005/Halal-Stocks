import mysql, { type Pool } from 'mysql2/promise';

const CONNECT_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3_000;

/**
 * สร้าง connection pool ไปที่ MySQL จาก URL เช่น mysql://user:pass@host:3306/dbname
 * ลองเชื่อมต่อซ้ำหลายครั้ง เพราะตอน `docker compose up` MySQL อาจยังเปิดไม่เสร็จ
 */
export async function createMysqlPool(url: string): Promise<Pool> {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 5,
    charset: 'utf8mb4', // รองรับภาษาไทยและ emoji
    timezone: 'Z',
  });

  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return pool;
    } catch (err) {
      if (attempt >= CONNECT_ATTEMPTS) {
        await pool.end();
        throw new Error(
          `Could not connect to MySQL after ${attempt} attempts: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
      console.log(`[db] MySQL not ready yet (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
