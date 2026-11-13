import { Router } from 'express';
import type { StocksResponse } from '@shared/types';
import { stocksQuerySchema } from '../schemas.js';
import type { ShariahRepository } from '../services/shariahService.js';

export function stocksRouter(shariah: ShariahRepository): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { market } = stocksQuerySchema.parse(req.query);
    const body: StocksResponse = { stocks: await shariah.list({ market }) };
    res.json(body);
  });
  return router;
}
