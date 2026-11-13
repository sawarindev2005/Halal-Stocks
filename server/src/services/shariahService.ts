import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Market, Stock } from '@shared/types';

/**
 * Source of the Shariah-screened stock list.
 * The app only depends on this interface, so the JSON file can later be swapped for a
 * database table or an external API without touching the routes.
 */
export interface ShariahRepository {
  list(filter?: { market?: Market }): Promise<Stock[]>;
  get(symbol: string): Promise<Stock | undefined>;
}

const stockSchema = z.object({
  symbol: z.string().min(1).toUpperCase(),
  name: z.string().min(1),
  market: z.enum(['TH', 'US']),
  sector: z.string().min(1),
  screenedBy: z.string().min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

const fileSchema = z.object({
  stocks: z.array(stockSchema),
});

export const DEFAULT_LIST_PATH = fileURLToPath(
  new URL('../../data/shariah_list.json', import.meta.url),
);

/** Reads `data/shariah_list.json` once and keeps it in memory. */
export class JsonFileShariahRepository implements ShariahRepository {
  private cache: Promise<Stock[]> | undefined;

  constructor(private readonly filePath: string = DEFAULT_LIST_PATH) {}

  private load(): Promise<Stock[]> {
    this.cache ??= readFile(this.filePath, 'utf8')
      .then((raw) => {
        const parsed = fileSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
          throw new Error(`Invalid Shariah list in ${this.filePath}:\n  ${issues.join('\n  ')}`);
        }
        return parsed.data.stocks;
      })
      .catch((err: unknown) => {
        // Allow a retry on the next call (e.g. after the file is fixed)
        this.cache = undefined;
        throw err;
      });
    return this.cache;
  }

  async list(filter: { market?: Market } = {}): Promise<Stock[]> {
    const stocks = await this.load();
    return filter.market ? stocks.filter((s) => s.market === filter.market) : stocks;
  }

  async get(symbol: string): Promise<Stock | undefined> {
    const stocks = await this.load();
    return stocks.find((s) => s.symbol === symbol.toUpperCase());
  }
}
