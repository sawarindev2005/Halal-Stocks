import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsDigestJob, NewsDigestResult } from '../src/news/digestJob.js';
import { localDateTime } from '../src/news/localTime.js';
import { SqliteNewsRepository } from '../src/news/newsRepository.js';
import { dailyTimeOf, isDigestOverdue, startNewsSchedule } from '../src/news/scheduler.js';

const TZ = 'Asia/Bangkok';
// 09:40 เวลาไทย = 02:40 UTC (เหมือนวันที่คอมตื่นจาก Sleep)
const MORNING_AFTER_WAKE = new Date('2026-10-30T02:40:00.000Z');
// 06:30 เวลาไทย — ยังไม่ถึงเวลาส่ง
const BEFORE_SEVEN = new Date('2026-10-29T23:30:00.000Z');

describe('localDateTime', () => {
  it('uses the given time zone, not the machine one', () => {
    expect(localDateTime(MORNING_AFTER_WAKE, TZ)).toEqual({
      date: '2026-10-30',
      minutes: 9 * 60 + 40,
    });
    // 23:30 UTC ของวันที่ 29 คือ 06:30 ของวันที่ 30 ในไทย
    expect(localDateTime(BEFORE_SEVEN, TZ)).toEqual({ date: '2026-10-30', minutes: 6 * 60 + 30 });
  });
});

describe('dailyTimeOf', () => {
  it('reads simple daily schedules only', () => {
    expect(dailyTimeOf('0 7 * * *')).toEqual({ hour: 7, minute: 0 });
    expect(dailyTimeOf('30 18 * * *')).toEqual({ hour: 18, minute: 30 });
    expect(dailyTimeOf('0 7 * * 1-5')).toBeNull();
    expect(dailyTimeOf('*/5 * * * *')).toBeNull();
  });
});

describe('isDigestOverdue', () => {
  const daily = { hour: 7, minute: 0 };
  it('is overdue after 07:00 when today has not been sent', () => {
    expect(
      isDigestOverdue({ now: MORNING_AFTER_WAKE, timeZone: TZ, daily, sentToday: false }),
    ).toBe(true);
  });
  it('is not overdue once sent, or before 07:00', () => {
    expect(isDigestOverdue({ now: MORNING_AFTER_WAKE, timeZone: TZ, daily, sentToday: true })).toBe(
      false,
    );
    expect(isDigestOverdue({ now: BEFORE_SEVEN, timeZone: TZ, daily, sentToday: false })).toBe(
      false,
    );
  });
});

describe('SqliteNewsRepository digest runs', () => {
  it('remembers which days were sent', async () => {
    const repo = new SqliteNewsRepository(':memory:');
    expect(await repo.hasDigestFor('2026-10-30')).toBe(false);
    await repo.markDigestSent('2026-10-30', MORNING_AFTER_WAKE);
    await repo.markDigestSent('2026-10-30', MORNING_AFTER_WAKE); // ซ้ำได้ ไม่ error
    expect(await repo.hasDigestFor('2026-10-30')).toBe(true);
    expect(await repo.hasDigestFor('2026-10-31')).toBe(false);
    await repo.close();
  });
});

describe('startNewsSchedule catch-up', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fakeJob() {
    const runOnce = vi.fn(async () => ({ skippedReason: 'test' }) as NewsDigestResult);
    return { job: { runOnce } as NewsDigestJob, runOnce };
  }

  async function startAt(now: Date, sentToday: boolean) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { job, runOnce } = fakeJob();
    const schedule = startNewsSchedule(job, {
      repo: { hasDigestFor: async () => sentToday },
      now: () => now,
    });
    await vi.advanceTimersByTimeAsync(61_000); // เช็กครั้งแรกหลังเปิด 1 นาที
    return { schedule, runOnce };
  }

  it('sends right away when the server comes back after 07:00 and today was missed', async () => {
    const { schedule, runOnce } = await startAt(MORNING_AFTER_WAKE, false);
    expect(runOnce).toHaveBeenCalledTimes(1);

    // เช็กรอบถัดไป (10 นาที) ไม่ส่งซ้ำ เพราะยังไม่ครบ 1 ชั่วโมงหลังลองครั้งก่อน
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runOnce).toHaveBeenCalledTimes(1);
    await schedule.stop();
  });

  it('does nothing when today was already sent, or before 07:00', async () => {
    const sent = await startAt(MORNING_AFTER_WAKE, true);
    expect(sent.runOnce).not.toHaveBeenCalled();
    await sent.schedule.stop();

    const early = await startAt(BEFORE_SEVEN, false);
    expect(early.runOnce).not.toHaveBeenCalled();
    await early.schedule.stop();
  });
});
