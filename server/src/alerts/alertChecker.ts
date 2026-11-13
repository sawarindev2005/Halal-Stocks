import { isConditionMet } from '@shared/alerts';
import type { AlertCheckSummary, AlertRule, Quote } from '@shared/types';
import { errorMessage } from '../lib/errors.js';
import type { PriceService } from '../services/priceService.js';
import type { ShariahRepository } from '../services/shariahService.js';
import type { AlertRepository } from './alertRepository.js';
import { buildAlertMessage, type Notifier } from './discordNotifier.js';

export { isConditionMet };

/**
 * Whether `rule` should notify now. Besides the condition itself:
 * - the cooldown since the last notification must have passed, and
 * - the quote must be newer than the one that last triggered it — otherwise a closed
 *   market (same stale price all weekend) would re-alert every time the cooldown ends.
 */
export function shouldTrigger(rule: AlertRule, quote: Quote, now: Date): boolean {
  if (!rule.active || !isConditionMet(rule, quote)) return false;

  if (rule.lastTriggeredAt) {
    const elapsedMs = now.getTime() - new Date(rule.lastTriggeredAt).getTime();
    if (elapsedMs < rule.cooldownMinutes * 60_000) return false;
  }

  if (rule.lastTriggeredMarketTime && quote.marketTime) {
    if (new Date(quote.marketTime) <= new Date(rule.lastTriggeredMarketTime)) return false;
  }

  return true;
}

export interface AlertCheckerDeps {
  repo: AlertRepository;
  prices: PriceService;
  /** null when DISCORD_WEBHOOK_URL is not set — checks are then skipped */
  notifier: Notifier | null;
  shariah?: ShariahRepository;
  /** Base URL of the web app, used for links in messages */
  appUrl?: string;
  now?: () => Date;
}

export interface AlertChecker {
  /** One full pass. Never rejects; problems are reported in the summary. */
  runOnce(): Promise<AlertCheckSummary>;
  lastCheck(): AlertCheckSummary | null;
}

export function createAlertChecker({
  repo,
  prices,
  notifier,
  shariah,
  appUrl,
  now = () => new Date(),
}: AlertCheckerDeps): AlertChecker {
  let last: AlertCheckSummary | null = null;
  let inFlight: Promise<AlertCheckSummary> | null = null;

  async function check(): Promise<AlertCheckSummary> {
    const startedAt = now();
    const summary: AlertCheckSummary = {
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      checked: 0,
      triggered: 0,
      skippedReason: null,
      errors: [],
    };

    try {
      await evaluate(summary);
    } catch (err) {
      // e.g. the database is unreadable — report it rather than crash the scheduler
      summary.errors.push({ symbol: '*', message: errorMessage(err) });
    }

    summary.finishedAt = now().toISOString();
    last = summary;
    return summary;
  }

  async function evaluate(summary: AlertCheckSummary): Promise<void> {
    const rules = await repo.list({ activeOnly: true });
    if (!notifier) {
      summary.skippedReason = 'DISCORD_WEBHOOK_URL is not set';
    } else if (rules.length > 0) {
      const symbols = [...new Set(rules.map((r) => r.symbol))];
      const quotes = new Map<string, Quote>();
      for (const result of await prices.getQuotes(symbols)) {
        if (result.ok) quotes.set(result.symbol, result.quote);
        else summary.errors.push({ symbol: result.symbol, message: result.error });
      }

      // Sequential on purpose: keeps us well inside Discord's webhook rate limit.
      for (const rule of rules) {
        const quote = quotes.get(rule.symbol);
        if (!quote) continue;
        summary.checked++;
        const at = now();
        if (!shouldTrigger(rule, quote, at)) continue;
        try {
          const stock = await shariah?.get(rule.symbol);
          await notifier.send(buildAlertMessage(rule, quote, { stock, appUrl, now: at }));
          await repo.markTriggered(rule.id, {
            at,
            price: quote.price,
            marketTime: quote.marketTime,
          });
          summary.triggered++;
        } catch (err) {
          summary.errors.push({
            symbol: rule.symbol,
            alertId: rule.id,
            message: errorMessage(err),
          });
        }
      }
    }
  }

  return {
    runOnce() {
      // A manual "check now" during a scheduled run joins it instead of sending twice.
      inFlight ??= check().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    lastCheck: () => last,
  };
}
