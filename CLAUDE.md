# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Shariah Stock Watch: a web app showing prices, candlestick charts and Discord price alerts for Shariah-screened Thai (SET) and US stocks. The README and other docs are in Thai, and UI text and Discord messages are Thai too. Requires Node >= 22.13 (`node:sqlite` is used).

There are three separate npm packages: root (tooling only), `server/` and `client/`. Each has its own `node_modules` and lockfile. Install them all with `npm run install:all`.

## Commands

Run from the root:

- `npm run dev`: starts the server (tsx watch, port 4000) and the client (Vite, port 5173) together. Vite proxies `/api/*` to Express.
- `npm test`: server tests, then client tests (Vitest)
- `npm run lint`: ESLint over the whole repo (one flat config at the root)
- `npm run format` / `npm run format:check`: Prettier (single quotes, trailing commas, width 100)
- `npm run build`: typechecks the server (no emit; it runs through tsx) and builds the client to `client/dist`
- `npm --prefix server run news:once -- --dry-run`: runs the news digest once and prints it without sending

Single test file / test name:

```bash
npm --prefix server test -- test/alertChecker.test.ts
npm --prefix server test -- -t "cooldown"
npm --prefix client test -- src/test/indicators.test.ts
```

Typecheck one side: `npm --prefix server run typecheck` / `npm --prefix client run typecheck`.

On Windows, stopping dev tasks can leave orphan node processes holding ports 4000/5173.

## Architecture

**`shared/`** has no package of its own. It is imported as `@shared/*` by both sides, through tsconfig `paths` plus a matching `resolve.alias` in both `server/vitest.config.ts` and `client/vite.config.ts`. A new alias must be added in all of these places. `shared/types.ts` holds the API contract types (Stock, Quote, Candle, AlertRule, ApiError, the enum arrays such as `HISTORY_RANGES`/`ALERT_CONDITIONS`). `shared/alerts.ts#isConditionMet` is the single condition evaluator, used by both the server checker and the UI's "condition met now" hint.

**Server (Express 5, ESM, run directly by tsx).** Relative imports inside `server/src` use `.js` extensions.

- `src/index.ts` is the composition root (top-level `await`). It builds the concrete instances (`JsonFileShariahRepository`, `createPriceService()` over Yahoo, the repositories, the Discord notifier when `DISCORD_WEBHOOK_URL` is set, otherwise `null`, and both cron schedules) and passes them into `createApp(deps)`.
- Storage: `db/index.ts#openRepositories` picks MySQL (`mysql2` pool) when `DATABASE_URL` is set, otherwise SQLite files in `server/data`. Each store has an async interface with two implementations: `AlertRepository` (`SqliteAlertRepository` / `MysqlAlertRepository`) and `NewsRepository` (`SqliteNewsRepository` / `MysqlNewsRepository`). A behavior change must be made in both (shared helpers: `toRule`, `needsTriggerReset`). The SQLite versions accept `':memory:'` for tests. `test/mysql.test.ts` runs only when `TEST_MYSQL_URL` is set.
- `src/app.ts#createApp` depends only on interfaces. Tests build the app with in-memory fakes, for example a `PriceSource` stub wrapped in `createPriceService` and an object implementing `ShariahRepository`, then call it with supertest. `/api/alerts` is mounted only when `alerts` deps are passed.
- `services/priceService.ts`: a `PriceSource` (raw provider) is wrapped by a `PriceService` (TTL cache: quotes 60s, history 5min). `getQuotes` never rejects. Failed symbols come back as `{ ok: false, error }`, and the UI shows "—" for them. The alert checker reuses the same `PriceService` instance, so it shares the cache with the API.
- To swap the Shariah list source (DB/API), implement `ShariahRepository` and change it in `index.ts`. `server/data/shariah_list.json` is validated with zod and read once at startup, so restart after editing it. Thai symbols must end in `.BK`. A "sample data" banner shows in the UI while any `screenedBy` contains "SAMPLE".
- Validation: request schemas live in `src/schemas.ts` (zod). Routes throw a `ZodError` or `HttpError`, and `lib/errors.ts#errorHandler` turns them into the uniform `{ error: { code, message, details? } }` shape. The env config is zod-validated in `config.ts`.
- Alerts (`src/alerts/`, see its README): the scheduler (node-cron, `ALERT_CHECK_CRON`) calls the checker, which fetches quotes, evaluates the rules, sends to Discord, and records them. A rule fires again only after its cooldown has passed **and** the quote's `marketTime` is newer than the last notified one. A failed send isn't recorded, so the next run retries it. Editing a rule's condition or threshold, or re-activating it, resets its history. Limits: 200 rules, and the symbol must be in the Shariah list.
- News digest (`src/news/`, see its README) is independent of alerts; it only reuses `createDiscordNotifier`, the DB, and the Shariah list. `news/index.ts#createNewsDigestFromConfig` wires it for both the server and the `news:once` CLI (`--dry-run` prints instead of sending). The pipeline is RSS (`feeds.ts`, Yahoo per-symbol feeds built from the Shariah list) → drop keys already in `sent_news` → an AI `Summarizer`: Claude (`summarizer.ts`) or Gemini (`geminiSummarizer.ts`), chosen by `NEWS_AI_PROVIDER` or by whichever key is set (Claude first). Both share `SYSTEM_PROMPT`, `DigestSchema`, `buildPrompt`, and `toSections`, and pick articles by id, so links always come from the feed → `digestMessage.ts` (Discord `content`, at most 2,000 chars per message) → `markSent`. The job never throws: failed feeds are skipped, and an AI failure or a missing key falls back to `headlinesOnly`. Nothing is recorded when a Discord send fails. The schedule uses node-cron's `timezone` (`NEWS_TIMEZONE`, default `Asia/Bangkok`). Catch-up: after every real send the job records the local date in `news_runs` (`markDigestSent`), and `startNewsSchedule` checks every 10 min (first check 1 min after start) and runs the job if today's time has passed with no record. Retries are throttled to once an hour, and catch-up only works for simple `M H * * *` crons (`dailyTimeOf`). `runOnce` joins a run already in flight, so the cron run and a catch-up run never double-send. Code comments in this module are in Thai, at the user's request.

**Client (React 19, Vite, TanStack Query, React Router, Tailwind v4, lightweight-charts).**

- `src/api/client.ts` holds all fetching and the Query hooks. `MAX_SYMBOLS_PER_REQUEST` (50) must match `server/src/schemas.ts`, because the client splits quote requests into chunks of that size. `VITE_API_BASE_URL` is used only when the client isn't served behind the Vite proxy.
- Pure logic lives in `src/lib/` (MA indicators, watchlist filter/sort, alert text, formatting, range→interval mapping) and is what the unit tests in `src/test/` cover. Components stay thin. The 5Y range uses weekly candles, so MAs count weeks there.
- Design tokens live in `src/index.css`. The `slate-*` scale is redefined as a lapis-tinted ink, `brand-*` is lapis, and `gilt-*` is used only for the Shariah badge and the `.star-band` header strip. Fonts are Anuphan (body) and Bai Jamjuree (`font-display`, h1/h2). The chart colors in `CandleChart.tsx` and the MA colors in `lib/ranges.ts` are hex values kept in sync with these tokens by hand.

**Docker.** `docker compose up -d --build` runs `mysql` (volume `mysql-data`), `server` (`server/Dockerfile`, tsx at runtime), and `web` (`client/Dockerfile`: Vite build served by nginx, which proxies `/api` to `server:4000`; port `WEB_PORT`, default 8080). Both images build from the repo root because they need `shared/`. Compose reads `.env` and requires `MYSQL_PASSWORD`/`MYSQL_ROOT_PASSWORD`. It builds `DATABASE_URL` itself, so passwords must be URL-safe.

## Conventions

- ESLint enforces `consistent-type-imports` with inline style (`import { x, type Y }`). Unused vars or args are allowed only with a `_` prefix.
- TS is strict with `noUncheckedIndexedAccess`, so indexed access needs `!` or a guard.
- `.env` lives at the repo root, and the server loads it with `--env-file-if-exists=../.env`. `*.sqlite` files are gitignored.
