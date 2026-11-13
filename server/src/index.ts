import { createAlertChecker } from './alerts/alertChecker.js';
import { createDiscordNotifier } from './alerts/discordNotifier.js';
import { startAlertSchedule } from './alerts/scheduler.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openRepositories } from './db/index.js';
import { createNewsDigestFromConfig } from './news/index.js';
import { startNewsSchedule } from './news/scheduler.js';
import { createPriceService } from './services/priceService.js';
import { JsonFileShariahRepository } from './services/shariahService.js';

const config = loadConfig();

// Shared instances — the alert checker reuses `prices` so it shares the quote cache with the API.
const shariah = new JsonFileShariahRepository();
const prices = createPriceService();

// MySQL when DATABASE_URL is set (docker compose), otherwise the SQLite files in server/data.
const repos = await openRepositories(config);

const alertRepo = repos.alerts;
const notifier = config.DISCORD_WEBHOOK_URL
  ? createDiscordNotifier(config.DISCORD_WEBHOOK_URL)
  : null;
const checker = createAlertChecker({
  repo: alertRepo,
  prices,
  notifier,
  shariah,
  appUrl: config.CLIENT_ORIGIN,
});
const schedule = startAlertSchedule(checker, config.ALERT_CHECK_CRON);

// Daily news digest — a separate job; it only shares the database and the shariah list.
const news = createNewsDigestFromConfig(config, { repo: repos.news, shariah });
const newsSchedule = startNewsSchedule(news.job, {
  expression: config.NEWS_CRON,
  timezone: config.NEWS_TIMEZONE,
  repo: repos.news, // enables catch-up when 07:00 was missed (computer asleep, server down)
});

const app = createApp({
  clientOrigin: config.CLIENT_ORIGIN,
  shariah,
  prices,
  alerts: { repo: alertRepo, checker, notifier, schedule },
});

const server = app.listen(config.PORT, () => {
  console.log(
    `[server] listening on http://localhost:${config.PORT} (CORS: ${config.CLIENT_ORIGIN}, database: ${repos.kind})`,
  );
  console.log(
    notifier
      ? `[alerts] Discord webhook set, checking on schedule "${schedule.expression}"`
      : '[alerts] DISCORD_WEBHOOK_URL is not set — alerts are saved but not sent',
  );
  console.log(
    news.webhookConfigured
      ? `[news] daily digest on "${newsSchedule.expression}" (${newsSchedule.timezone}), next: ${newsSchedule.nextRun()?.toISOString() ?? '—'}` +
          `, AI: ${news.aiLabel}`
      : '[news] no Discord webhook set — daily digest is off',
  );
});

async function shutdown() {
  await schedule.stop();
  await newsSchedule.stop();
  server.close();
  await repos.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
