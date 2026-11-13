import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { historyParamsSchema, historyQuerySchema } from '../schemas.js';
import { SymbolNotFoundError, type PriceService } from '../services/priceService.js';

export function historyRouter(prices: PriceService): Router {
  const router = Router();
  router.get('/:symbol', async (req, res) => {
    const { symbol } = historyParamsSchema.parse(req.params);
    const { range, interval } = historyQuerySchema.parse(req.query);
    try {
      res.json(await prices.getHistory(symbol, range, interval));
    } catch (err) {
      if (err instanceof SymbolNotFoundError)
        throw new HttpError(404, 'SYMBOL_NOT_FOUND', err.message);
      throw new HttpError(502, 'UPSTREAM_ERROR', `Could not load price history for ${symbol}`);
    }
  });
  return router;
}
