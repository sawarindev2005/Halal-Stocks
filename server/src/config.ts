import cron from 'node-cron';
import { z } from 'zod';
import { DEFAULT_ALERTS_DB_PATH } from './alerts/alertRepository.js';
import { DEFAULT_ALERT_SCHEDULE } from './alerts/scheduler.js';
import { DEFAULT_GEMINI_MODEL } from './news/geminiSummarizer.js';
import { DEFAULT_NEWS_DB_PATH } from './news/newsRepository.js';
import { DEFAULT_NEWS_SCHEDULE, DEFAULT_NEWS_TIMEZONE } from './news/scheduler.js';
import { DEFAULT_NEWS_MODEL } from './news/summarizer.js';

/** Optional setting: an empty value in .env counts as "not set". */
function optional<T extends z.ZodType>(schema: T) {
  return schema.optional().or(z.literal('').transform(() => undefined));
}

const discordWebhookUrl = z
  .string()
  .url()
  .refine(
    (u) => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(u),
    'Must be a Discord webhook URL (https://discord.com/api/webhooks/...)',
  );

const cronExpression = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .refine((expr) => cron.validate(expr), 'Invalid cron expression');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Discord webhook for price alerts. Without it alerts are stored but never sent.
  DISCORD_WEBHOOK_URL: optional(discordWebhookUrl),
  ALERT_CHECK_CRON: cronExpression(DEFAULT_ALERT_SCHEDULE),
  ALERTS_DB_PATH: z.string().min(1).default(DEFAULT_ALERTS_DB_PATH),

  // MySQL (mysql://user:pass@host:3306/db). When unset, the SQLite files in server/data are used.
  DATABASE_URL: optional(
    z
      .string()
      .regex(/^mysql:\/\//, 'Must start with mysql:// (e.g. mysql://user:pass@host:3306/db)'),
  ),

  // Daily news digest. Falls back to DISCORD_WEBHOOK_URL when NEWS_DISCORD_WEBHOOK_URL is unset.
  NEWS_DISCORD_WEBHOOK_URL: optional(discordWebhookUrl),
  // Which AI summarizes the news. Unset = whichever key below is present (Claude first).
  // Without any key the digest is still sent, as headlines + links only.
  NEWS_AI_PROVIDER: optional(z.enum(['claude', 'gemini'])),
  ANTHROPIC_API_KEY: optional(z.string().min(1)),
  NEWS_MODEL: z.string().min(1).default(DEFAULT_NEWS_MODEL),
  GEMINI_API_KEY: optional(z.string().min(1)),
  GEMINI_MODEL: z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  NEWS_CRON: cronExpression(DEFAULT_NEWS_SCHEDULE),
  NEWS_TIMEZONE: z
    .string()
    .default(DEFAULT_NEWS_TIMEZONE)
    .refine(isValidTimeZone, 'Unknown time zone (e.g. Asia/Bangkok)'),
  NEWS_DB_PATH: z.string().min(1).default(DEFAULT_NEWS_DB_PATH),
});

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
