import { createDiscordNotifier } from '../alerts/discordNotifier.js';
import type { Config } from '../config.js';
import type { ShariahRepository } from '../services/shariahService.js';
import { createNewsDigestJob, type NewsDigestJob } from './digestJob.js';
import { createFeedFetcher } from './feedFetcher.js';
import { newsCategories } from './feeds.js';
import { createGeminiSummarizer } from './geminiSummarizer.js';
import type { NewsRepository } from './newsRepository.js';
import { createClaudeSummarizer, type Summarizer } from './summarizer.js';

/**
 * เลือก AI ที่ใช้สรุปข่าว:
 * - ตั้ง NEWS_AI_PROVIDER=claude หรือ gemini → ใช้ตามนั้น (ต้องมี key ของค่ายนั้น)
 * - ไม่ตั้ง → ใช้ค่ายที่มี key (ถ้ามีทั้งคู่ ใช้ Claude)
 * - ไม่มี key เลย → null (ส่งแค่หัวข้อข่าว)
 */
function pickSummarizer(config: Config): { summarizer: Summarizer | null; label: string } {
  const provider =
    config.NEWS_AI_PROVIDER ??
    (config.ANTHROPIC_API_KEY ? 'claude' : config.GEMINI_API_KEY ? 'gemini' : null);

  if (provider === 'claude' && config.ANTHROPIC_API_KEY) {
    return {
      summarizer: createClaudeSummarizer({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.NEWS_MODEL,
      }),
      label: `Claude (${config.NEWS_MODEL})`,
    };
  }
  if (provider === 'gemini' && config.GEMINI_API_KEY) {
    return {
      summarizer: createGeminiSummarizer({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
      }),
      label: `Gemini (${config.GEMINI_MODEL})`,
    };
  }
  const missing = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY / GEMINI_API_KEY';
  return { summarizer: null, label: `off (no ${missing}) — headlines only` };
}

/**
 * ประกอบระบบสรุปข่าวจาก config — ใช้ทั้งตอน server รัน (index.ts) และโหมดทดสอบ (runOnce.ts)
 */
export function createNewsDigestFromConfig(
  config: Config,
  { repo, shariah }: { repo: NewsRepository; shariah: ShariahRepository },
): { job: NewsDigestJob; webhookConfigured: boolean; aiLabel: string } {
  // ใช้ webhook แยกของข่าวถ้ามี ไม่งั้นใช้ห้องเดียวกับแจ้งเตือนราคา
  const webhookUrl = config.NEWS_DISCORD_WEBHOOK_URL ?? config.DISCORD_WEBHOOK_URL;
  const { summarizer, label } = pickSummarizer(config);

  const job = createNewsDigestJob({
    categories: async () => newsCategories((await shariah.list()).map((s) => s.symbol)),
    fetcher: createFeedFetcher(),
    summarizer,
    repo,
    notifier: webhookUrl ? createDiscordNotifier(webhookUrl) : null,
    timeZone: config.NEWS_TIMEZONE,
  });

  return { job, webhookConfigured: Boolean(webhookUrl), aiLabel: label };
}
