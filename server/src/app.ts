import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { alertsRouter, type AlertsDeps } from './routes/alerts.js';
import { healthRouter } from './routes/health.js';
import { historyRouter } from './routes/history.js';
import { quotesRouter } from './routes/quotes.js';
import { stocksRouter } from './routes/stocks.js';
import type { PriceService } from './services/priceService.js';
import type { ShariahRepository } from './services/shariahService.js';

export interface AppDeps {
  clientOrigin: string;
  shariah: ShariahRepository;
  prices: PriceService;
  /** Price alerts; the /api/alerts routes are only mounted when provided. */
  alerts?: Omit<AlertsDeps, 'shariah'>;
}

export function createApp({ clientOrigin, shariah, prices, alerts }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json());

  app.use('/api/health', healthRouter());
  app.use('/api/stocks', stocksRouter(shariah));
  app.use('/api/quotes', quotesRouter(prices));
  app.use('/api/history', historyRouter(prices));
  if (alerts) app.use('/api/alerts', alertsRouter({ ...alerts, shariah }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
