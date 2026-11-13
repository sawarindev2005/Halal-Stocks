import type { AlertCondition, AlertRule, Quote, Stock } from '@shared/types';

/** Subset of Discord's webhook payload that we use. */
export interface DiscordMessage {
  username?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** ISO timestamp — Discord shows it in each viewer's local time */
  timestamp?: string;
  footer?: { text: string };
}

export interface Notifier {
  send(message: DiscordMessage): Promise<void>;
}

export class NotifierError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NotifierError';
  }
}

const USERNAME = 'Shariah Stock Watch';
const REQUEST_TIMEOUT_MS = 10_000;
/** Longest rate-limit wait we are willing to sit through before giving up. */
const MAX_RETRY_AFTER_MS = 5_000;

const COLOR_UP = 0x16a34a;
const COLOR_DOWN = 0xdc2626;
const COLOR_INFO = 0x0d9488;

type FetchFn = typeof fetch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Posts messages to a Discord webhook. Retries once when Discord asks us to slow down (429). */
export function createDiscordNotifier(
  webhookUrl: string,
  {
    fetchFn = fetch,
    wait = sleep,
  }: { fetchFn?: FetchFn; wait?: (ms: number) => Promise<unknown> } = {},
): Notifier {
  async function post(message: DiscordMessage): Promise<Response> {
    try {
      return await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Never let a message ping @everyone or a user, whatever text ends up in it.
        body: JSON.stringify({ username: USERNAME, allowed_mentions: { parse: [] }, ...message }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new NotifierError(
        `Could not reach Discord: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    async send(message) {
      let res = await post(message);
      if (res.status === 429) {
        const retryAfterMs = await retryAfter(res);
        if (retryAfterMs > MAX_RETRY_AFTER_MS) {
          throw new NotifierError('Discord rate limit reached, try again later', 429);
        }
        await wait(retryAfterMs);
        res = await post(message);
      }
      if (!res.ok) throw new NotifierError(describeFailure(res.status), res.status);
    },
  };
}

async function retryAfter(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retry_after?: number };
    if (typeof body.retry_after === 'number') return body.retry_after * 1000;
  } catch {
    // fall through to the header
  }
  const header = Number(res.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header * 1000 : 1000;
}

function describeFailure(status: number): string {
  if (status === 401 || status === 404) {
    return 'Discord rejected the webhook URL (deleted or mistyped?)';
  }
  if (status === 429) return 'Discord rate limit reached, try again later';
  return `Discord returned HTTP ${status}`;
}

// ---------------------------------------------------------------------------
// Message formatting (Thai, user-facing)
// ---------------------------------------------------------------------------

function num(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(n: number, suffix = ''): string {
  return `${n > 0 ? '+' : ''}${num(n)}${suffix}`;
}

export function describeCondition(condition: AlertCondition, threshold: number): string {
  switch (condition) {
    case 'price_above':
      return `ราคาสูงกว่า ${num(threshold)}`;
    case 'price_below':
      return `ราคาต่ำกว่า ${num(threshold)}`;
    case 'change_up':
      return `วันนี้ขึ้นเกิน ${num(threshold)}%`;
    case 'change_down':
      return `วันนี้ลงเกิน ${num(threshold)}%`;
  }
}

export function buildAlertMessage(
  rule: AlertRule,
  quote: Quote,
  { stock, appUrl, now = new Date() }: { stock?: Stock; appUrl?: string; now?: Date } = {},
): DiscordMessage {
  const currency = quote.currency ? ` ${quote.currency}` : '';
  const up = rule.condition === 'price_above' || rule.condition === 'change_up';
  return {
    embeds: [
      {
        title: `${up ? '📈' : '📉'} ${rule.symbol} ${describeCondition(rule.condition, rule.threshold)}`,
        url: appUrl ? `${appUrl}/stock/${encodeURIComponent(rule.symbol)}` : undefined,
        description: stock?.name,
        color: up ? COLOR_UP : COLOR_DOWN,
        fields: [
          { name: 'ราคาล่าสุด', value: `${num(quote.price)}${currency}`, inline: true },
          {
            name: 'เปลี่ยนแปลงวันนี้',
            value: `${signed(quote.change)} (${signed(quote.changePercent, '%')})`,
            inline: true,
          },
        ],
        timestamp: (quote.marketTime ? new Date(quote.marketTime) : now).toISOString(),
        footer: { text: 'ข้อมูลอาจล่าช้า ~15 นาที · ไม่ใช่คำแนะนำการลงทุน' },
      },
    ],
  };
}

export function buildTestMessage(now: Date = new Date()): DiscordMessage {
  return {
    embeds: [
      {
        title: '✅ เชื่อมต่อ Discord สำเร็จ',
        description: 'ข้อความทดสอบจาก Shariah Stock Watch — การแจ้งเตือนราคาจะส่งมาที่ห้องนี้',
        color: COLOR_INFO,
        timestamp: now.toISOString(),
      },
    ],
  };
}
