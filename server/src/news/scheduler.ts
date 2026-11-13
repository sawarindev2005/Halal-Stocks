import cron, { type ScheduledTask } from 'node-cron';
import type { NewsDigestJob, NewsDigestResult } from './digestJob.js';
import { localDateTime } from './localTime.js';
import type { NewsRepository } from './newsRepository.js';

/** ทุกวัน 07:00 น. (นาที 0, ชั่วโมง 7) */
export const DEFAULT_NEWS_SCHEDULE = '0 7 * * *';
export const DEFAULT_NEWS_TIMEZONE = 'Asia/Bangkok';

/** เช็กทุก 10 นาทีว่าวันนี้พลาดการส่งไปหรือเปล่า (เช่น คอม Sleep อยู่ตอน 07:00) */
const CATCH_UP_CHECK_MS = 10 * 60_000;
/** เช็กครั้งแรกหลัง server เปิด 1 นาที (รอให้ทุกอย่างพร้อมก่อน) */
const CATCH_UP_FIRST_CHECK_MS = 60_000;
/** ถ้าส่งย้อนหลังไม่สำเร็จ (เช่น Discord ล่ม) รออย่างน้อย 1 ชั่วโมงก่อนลองใหม่ */
const CATCH_UP_RETRY_MS = 60 * 60_000;

export interface NewsSchedule {
  readonly expression: string;
  readonly timezone: string;
  nextRun(): Date | null;
  stop(): Promise<void>;
}

/** พิมพ์ผลการรันหนึ่งรอบลง log ของ server */
export function logDigestResult(r: NewsDigestResult): void {
  if (r.skippedReason) {
    console.log(`[news] skipped: ${r.skippedReason}`);
    return;
  }
  const parts = [
    `${r.articlesFound} new articles`,
    `mode ${r.mode}`,
    r.dryRun
      ? `${r.messages.length} messages (dry run)`
      : `sent ${r.messagesSent}/${r.messages.length} messages`,
  ];
  console.log(`[news] ${parts.join(', ')}`);
  for (const e of r.feedErrors)
    console.log(`[news] feed failed, skipped: ${e.source} (${e.url}): ${e.message}`);
  if (r.summarizeError) console.log(`[news] summary fell back to headlines: ${r.summarizeError}`);
  if (r.sendError) console.log(`[news] error: ${r.sendError}`);
}

/**
 * เวลาส่งประจำวันจาก cron แบบ "นาที ชั่วโมง * * *" (เช่น "0 7 * * *" → 07:00)
 * cron รูปแบบอื่น (เช่น หลายเวลา/บางวัน) คืน null = ไม่ใช้ระบบส่งย้อนหลัง
 */
export function dailyTimeOf(expression: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(expression.trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  return minute < 60 && hour < 24 ? { hour, minute } : null;
}

/** ควรส่งย้อนหลังตอนนี้ไหม: เลยเวลาส่งของวันนี้แล้ว แต่วันนี้ยังไม่ได้ส่ง */
export function isDigestOverdue({
  now,
  timeZone,
  daily,
  sentToday,
}: {
  now: Date;
  timeZone: string;
  daily: { hour: number; minute: number };
  sentToday: boolean;
}): boolean {
  if (sentToday) return false;
  return localDateTime(now, timeZone).minutes >= daily.hour * 60 + daily.minute;
}

export interface NewsScheduleOptions {
  expression?: string;
  timezone?: string;
  /** ใช้เช็กว่าวันนี้ส่งไปแล้วหรือยัง (ไม่ใส่ = ปิดระบบส่งย้อนหลัง) */
  repo?: Pick<NewsRepository, 'hasDigestFor'>;
  now?: () => Date;
}

/**
 * ตั้งเวลาส่งสรุปข่าว — ระบุเขตเวลาเอง จึงตรงเวลาไทยแม้เครื่อง/คอนเทนเนอร์ตั้งเป็น UTC
 * และมีระบบส่งย้อนหลัง: ถ้าพลาดเวลา (คอม Sleep, server ปิดอยู่) จะส่งทันทีที่กลับมาทำงานในวันเดียวกัน
 */
export function startNewsSchedule(
  job: NewsDigestJob,
  {
    expression = DEFAULT_NEWS_SCHEDULE,
    timezone = DEFAULT_NEWS_TIMEZONE,
    repo,
    now = () => new Date(),
  }: NewsScheduleOptions = {},
): NewsSchedule {
  let lastAttemptAt = 0;

  async function run(reason: string) {
    lastAttemptAt = now().getTime();
    if (reason) console.log(`[news] ${reason}`);
    logDigestResult(await job.runOnce());
  }

  const task: ScheduledTask = cron.schedule(expression, () => run(''), {
    name: 'news-digest',
    timezone,
    noOverlap: true,
  });

  // ระบบส่งย้อนหลัง
  const daily = dailyTimeOf(expression);
  let checkTimer: NodeJS.Timeout | undefined;
  let firstTimer: NodeJS.Timeout | undefined;

  async function catchUp() {
    if (!daily || !repo) return;
    if (now().getTime() - lastAttemptAt < CATCH_UP_RETRY_MS) return;
    try {
      const today = localDateTime(now(), timezone).date;
      const sentToday = await repo.hasDigestFor(today);
      if (isDigestOverdue({ now: now(), timeZone: timezone, daily, sentToday })) {
        await run(`catching up: today's digest (${today}) was not sent at its scheduled time`);
      }
    } catch (err) {
      console.log(
        `[news] catch-up check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (daily && repo) {
    firstTimer = setTimeout(() => void catchUp(), CATCH_UP_FIRST_CHECK_MS);
    checkTimer = setInterval(() => void catchUp(), CATCH_UP_CHECK_MS);
  } else if (repo) {
    console.log(`[news] catch-up is off: schedule "${expression}" is not a simple daily time`);
  }

  return {
    expression,
    timezone,
    nextRun: () => task.getNextRun(),
    stop: async () => {
      clearTimeout(firstTimer);
      clearInterval(checkTimer);
      await task.destroy();
    },
  };
}
