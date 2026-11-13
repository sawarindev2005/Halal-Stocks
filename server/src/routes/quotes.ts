import { Router } from 'express';
import type { QuotesResponse } from '@shared/types';
import { quotesQuerySchema } from '../schemas.js';
import type { PriceService } from '../services/priceService.js';

export function quotesRouter(prices: PriceService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { symbols } = quotesQuerySchema.parse(req.query);
    // Partial failures are reported per symbol, so this always answers 200.
    const body: QuotesResponse = { results: await prices.getQuotes(symbols) };
    res.json(body);
  });
  return router;
}
