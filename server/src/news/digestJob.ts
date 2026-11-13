import type { Notifier } from '../alerts/discordNotifier.js';
import { errorMessage } from '../lib/errors.js';
import { buildDigestMessages, type DigestMode } from './digestMessage.js';
import { localDateTime } from './localTime.js';
import type { Article, FeedError, FeedFetcher } from './feedFetcher.js';
import type { NewsCategory } from './feeds.js';
import type { NewsRepository } from './newsRepository.js';
import {
  headlinesOnly,
  type CategoryArticles,
  type DigestSection,
  type Summarizer,
} from './summarizer.js';

const HOUR = 60 * 60_000;
const DISCORD_USERNAME = 'สรุปข่าวประจำวัน';

export interface NewsDigestDeps {
  /** หมวดข่าว (async เพราะต้องอ่านรายชื่อหุ้นชาริอะห์ก่อน) */
  categories: () => Promise<NewsCategory[]>;
  fetcher: FeedFetcher;
  /** null = ไม่มี API key ของ AI ค่ายไหนเลย → ส่งแค่หัวข้อข่าว */
  summarizer: Summarizer | null;
  repo: NewsRepository;
  /** null = ไม่ได้ตั้ง webhook → รันได้แค่โหมด dry-run */
  notifier: Notifier | null;
  now?: () => Date;
  timeZone?: string;
  /** ดึงข่าวย้อนหลังกี่ชั่วโมง */
  lookbackHours?: number;
  /** เก็บประวัติข่าวที่ส่งแล้วกี่วัน */
  historyDays?: number;
}

export interface NewsDigestResult {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  mode: DigestMode;
  /** จำนวนข่าวใหม่ (ยังไม่เคยส่ง) ที่ดึงมาได้ */
  articlesFound: number;
  /** ข้อความที่สร้าง (ใน dry-run จะไม่ถูกส่ง) */
  messages: string[];
  messagesSent: number;
  feedErrors: FeedError[];
  summarizeError: string | null;
  sendError: string | null;
  skippedReason: string | null;
}

export interface NewsDigestJob {
  /** รันหนึ่งรอบ ไม่ throw — ปัญหาทั้งหมดอยู่ในผลลัพธ์ */
  runOnce(options?: { dryRun?: boolean }): Promise<NewsDigestResult>;
}

export function createNewsDigestJob({
  categories,
  fetcher,
  summarizer,
  repo,
  notifier,
  now = () => new Date(),
  timeZone = 'Asia/Bangkok',
  lookbackHours = 24,
  historyDays = 14,
}: NewsDigestDeps): NewsDigestJob {
  async function run(result: NewsDigestResult, dryRun: boolean, startedAt: Date) {
    if (!notifier && !dryRun) {
      result.skippedReason =
        'No Discord webhook is set (NEWS_DISCORD_WEBHOOK_URL / DISCORD_WEBHOOK_URL)';
      return;
    }

    // 1) ดึงข่าวทุกหมวด
    const since = new Date(startedAt.getTime() - lookbackHours * HOUR);
    const cats = await categories();
    const fetched = await Promise.all(cats.map((c) => fetcher.fetchCategory(c, since)));
    result.feedErrors = fetched.flatMap((f) => f.errors);

    // 2) ตัดข่าวที่เคยส่งแล้ว และข่าวที่ซ้ำข้ามหมวด (หมวดที่อยู่ก่อนได้ไป)
    const allKeys = fetched.flatMap((f) => f.articles.map((a) => a.key));
    const alreadySent = await repo.findSent(allKeys);
    const taken = new Set<string>();
    const input: CategoryArticles[] = cats.map((category, i) => ({
      category,
      articles: fetched[i]!.articles.filter((a) => {
        if (alreadySent.has(a.key) || taken.has(a.key)) return false;
        taken.add(a.key);
        return true;
      }),
    }));
    result.articlesFound = taken.size;

    // 3) สรุปด้วย Claude — ถ้าล้มเหลวหรือไม่มี API key ใช้หัวข้อข่าวแทน
    let sections: DigestSection[];
    if (summarizer && result.articlesFound > 0) {
      try {
        sections = fillEmptySections(await summarizer.summarize(input), input);
      } catch (err) {
        result.summarizeError = errorMessage(err);
        result.mode = 'headlines';
        sections = headlinesOnly(input);
      }
    } else {
      if (!summarizer) {
        result.summarizeError = 'No AI API key is set (ANTHROPIC_API_KEY / GEMINI_API_KEY)';
        result.mode = 'headlines';
      }
      sections = headlinesOnly(input);
    }

    // 4) จัดรูปแบบข้อความ (แบ่งเป็นหลายข้อความถ้ายาวเกิน 2,000 ตัวอักษร)
    result.messages = buildDigestMessages(sections, {
      date: startedAt,
      mode: result.mode,
      timeZone,
    });
    if (dryRun) return;

    // 5) ส่งทีละข้อความตามลำดับ ถ้าส่งไม่ผ่าน หยุดและไม่บันทึกว่าส่งแล้ว (รอบหน้าจะลองใหม่)
    for (const content of result.messages) {
      try {
        await notifier!.send({ username: DISCORD_USERNAME, content });
        result.messagesSent++;
      } catch (err) {
        result.sendError = errorMessage(err);
        return;
      }
    }

    // 6) บันทึกข่าวที่ส่งไปแล้ว กันส่งซ้ำพรุ่งนี้ และลบประวัติที่เก่าเกินไป
    const sent = sections.flatMap((s) => s.items.map((item) => item.article));
    await repo.markSent(sent.map(toSentArticle), startedAt);
    await repo.pruneBefore(new Date(startedAt.getTime() - historyDays * 24 * HOUR));
    // จดว่าวันนี้ส่งแล้ว ระบบส่งย้อนหลังจะได้ไม่ส่งซ้ำ
    await repo.markDigestSent(localDateTime(startedAt, timeZone).date, startedAt);
  }

  let inFlight: Promise<NewsDigestResult> | null = null;

  return {
    runOnce({ dryRun = false } = {}) {
      if (dryRun) return execute(true);
      // ถ้ารอบตามเวลากับรอบส่งย้อนหลังชนกัน ให้รอผลรอบที่กำลังทำอยู่ แทนการส่งซ้ำสองครั้ง
      inFlight ??= execute(false).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };

  async function execute(dryRun: boolean): Promise<NewsDigestResult> {
    const startedAt = now();
    const result: NewsDigestResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      dryRun,
      mode: 'ai',
      articlesFound: 0,
      messages: [],
      messagesSent: 0,
      feedErrors: [],
      summarizeError: null,
      sendError: null,
      skippedReason: null,
    };
    try {
      await run(result, dryRun, startedAt);
    } catch (err) {
      // เช่น ฐานข้อมูลใช้งานไม่ได้ — รายงานแทนการทำให้ server ล่ม
      result.sendError ??= errorMessage(err);
    }
    result.finishedAt = now().toISOString();
    return result;
  }
}

/** ถ้า Claude ไม่เลือกข่าวไหนเลยในหมวดที่มีข่าว ให้ใช้หัวข้อข่าวของหมวดนั้นแทน */
function fillEmptySections(sections: DigestSection[], input: CategoryArticles[]): DigestSection[] {
  const fallback = new Map(headlinesOnly(input).map((s) => [s.category.id, s]));
  return input
    .filter((c) => c.articles.length > 0)
    .map(({ category }) => {
      const s = sections.find((x) => x.category.id === category.id);
      return s && s.items.length > 0 ? s : fallback.get(category.id)!;
    });
}

function toSentArticle(a: Article) {
  return { key: a.key, title: a.title, link: a.link, category: a.categoryId };
}
