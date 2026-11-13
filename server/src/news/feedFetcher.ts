import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type { FeedSource, NewsCategory, NewsCategoryId } from './feeds.js';

/** ข่าวหนึ่งชิ้นหลังอ่านจาก RSS แล้ว */
export interface Article {
  /** hash ของลิงก์ ใช้กันส่งซ้ำ */
  key: string;
  categoryId: NewsCategoryId;
  title: string;
  link: string;
  source: string;
  /** เวลาเผยแพร่ (ISO) */
  publishedAt: string;
  /** เนื้อหาย่อสั้น ๆ จากฟีด ให้ Claude ใช้ประกอบการสรุป */
  snippet: string;
}

export interface FeedError {
  source: string;
  url: string;
  message: string;
}

export interface CategoryFetchResult {
  articles: Article[];
  errors: FeedError[];
}

const REQUEST_TIMEOUT_MS = 15_000;
const SNIPPET_MAX_CHARS = 300;
// บางเว็บ (เช่น Yahoo) ตอบ 429 ถ้า User-Agent ไม่ใช่แบบเบราว์เซอร์
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
/** รอเท่านี้ก่อนลองใหม่ เมื่อโดนจำกัดจำนวนคำขอ (HTTP 429) */
const RETRY_DELAY_MS = 3_000;

/** query string ที่เป็นแค่ตัวติดตาม — ตัดทิ้งก่อนเทียบลิงก์ ไม่งั้นข่าวเดียวกันจะดูเหมือนคนละข่าว */
const TRACKING_PARAM = /^(utm_|\.tsrc$|ncid$|guccounter$|cmpid$|mod$|taid$)/i;

/** ทำลิงก์ให้เป็นรูปแบบเดียวกัน เช่น ตัด #hash, ตัว utm_*, และ / ท้ายสุด */
export function normalizeLink(link: string): string {
  try {
    const url = new URL(link.trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return link.trim();
  }
}

export function articleKey(link: string): string {
  return createHash('sha256').update(normalizeLink(link)).digest('hex');
}

function cleanText(text: string | undefined, max: number): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

type FetchFn = typeof fetch;

export interface FeedFetcherOptions {
  fetchFn?: FetchFn;
  /** จำนวนข่าวสูงสุดต่อหมวด (เอาใหม่สุดก่อน) */
  maxPerCategory?: number;
}

export interface FeedFetcher {
  /**
   * ดึงทุกฟีดในหมวด เอาเฉพาะข่าวที่เผยแพร่หลัง `since`
   * ไม่ throw: ฟีดที่ดึงไม่ได้จะถูกบันทึกใน `errors` แล้วข้ามไปฟีดถัดไป
   */
  fetchCategory(category: NewsCategory, since: Date): Promise<CategoryFetchResult>;
}

export function createFeedFetcher({
  fetchFn = fetch,
  maxPerCategory = 15,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: FeedFetcherOptions & { wait?: (ms: number) => Promise<unknown> } = {}): FeedFetcher {
  const parser = new Parser();

  const get = (url: string) =>
    fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, */*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  async function fetchFeed(feed: FeedSource) {
    let res = await get(feed.url);
    if (res.status === 429 || res.status >= 500) {
      // โดนจำกัดคำขอหรือเว็บมีปัญหาชั่วคราว — รอแป๊บแล้วลองอีกครั้งเดียว
      await wait(RETRY_DELAY_MS);
      res = await get(feed.url);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parser.parseString(await res.text());
  }

  return {
    async fetchCategory(category, since) {
      const errors: FeedError[] = [];
      const byKey = new Map<string, Article>();
      const seenTitles = new Set<string>();

      // ดึงทุกฟีดพร้อมกัน ฟีดไหนล่มก็ไม่กระทบฟีดอื่น
      const results = await Promise.allSettled(category.feeds.map(fetchFeed));

      results.forEach((result, i) => {
        const feed = category.feeds[i]!;
        if (result.status === 'rejected') {
          const reason = result.reason as unknown;
          errors.push({
            source: feed.name,
            url: feed.url,
            message: reason instanceof Error ? reason.message : String(reason),
          });
          return;
        }

        for (const item of result.value.items) {
          const title = cleanText(item.title, 300);
          const link = item.link?.trim();
          const date = item.isoDate ?? item.pubDate;
          if (!title || !link || !date) continue; // ข่าวที่ไม่มีวันที่ บอกไม่ได้ว่าใหม่ไหม จึงข้าม

          const published = new Date(date);
          if (Number.isNaN(published.getTime()) || published < since) continue;

          // ข่าวเดียวกันอาจอยู่หลายฟีด (เช่น Yahoo ชุด symbol ต่างกัน) — เก็บแค่ครั้งเดียว
          const key = articleKey(link);
          const titleKey = title.toLowerCase();
          if (byKey.has(key) || seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);

          byKey.set(key, {
            key,
            categoryId: category.id,
            title,
            link,
            source: feed.name,
            publishedAt: published.toISOString(),
            snippet: cleanText(item.contentSnippet ?? item.summary, SNIPPET_MAX_CHARS),
          });
        }
      });

      const articles = [...byKey.values()]
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, maxPerCategory);
      return { articles, errors };
    },
  };
}
