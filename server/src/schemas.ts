import { z } from 'zod';
import {
  ALERT_CONDITIONS,
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  HISTORY_INTERVALS,
  HISTORY_RANGES,
  type AlertCondition,
} from '@shared/types';

export const MAX_SYMBOLS_PER_REQUEST = 50;

/** Yahoo-style symbol: letters, digits and . - ^ = (e.g. ADVANC.BK, BRK-B, ^SET.BK). */
export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-^=]{1,15}$/, 'Invalid symbol');

export const stocksQuerySchema = z.object({
  market: z.enum(['TH', 'US']).optional(),
});

export const quotesQuerySchema = z.object({
  symbols: z
    .string({ error: 'Query parameter "symbols" is required' })
    .transform((s) => s.split(',').filter((x) => x.trim() !== ''))
    .pipe(
      z
        .array(symbolSchema)
        .min(1, 'Provide at least one symbol')
        .max(MAX_SYMBOLS_PER_REQUEST, `At most ${MAX_SYMBOLS_PER_REQUEST} symbols per request`),
    )
    // Remove duplicates while keeping the requested order
    .transform((list) => [...new Set(list)]),
});

export const historyParamsSchema = z.object({
  symbol: symbolSchema,
});

export const historyQuerySchema = z.object({
  range: z.enum(HISTORY_RANGES).default('1y'),
  interval: z.enum(HISTORY_INTERVALS).default('1d'),
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const MAX_ALERTS = 200;
const MAX_COOLDOWN_MINUTES = 7 * 24 * 60;

const thresholdSchema = z.number().positive('Threshold must be greater than 0').max(1e9);
const cooldownSchema = z.number().int().min(1).max(MAX_COOLDOWN_MINUTES);

/** A daily move can never exceed -100%, so such a change_down rule could never fire. */
function percentWithinRange(
  value: { condition?: AlertCondition; threshold?: number },
  ctx: z.RefinementCtx,
) {
  if (value.condition === 'change_down' && value.threshold !== undefined && value.threshold > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['threshold'],
      message: 'A daily drop cannot exceed 100%',
    });
  }
}

export const createAlertSchema = z
  .object({
    symbol: symbolSchema,
    condition: z.enum(ALERT_CONDITIONS),
    threshold: thresholdSchema,
    cooldownMinutes: cooldownSchema.default(DEFAULT_ALERT_COOLDOWN_MINUTES),
  })
  .strict()
  .superRefine(percentWithinRange);

export const updateAlertSchema = z
  .object({
    condition: z.enum(ALERT_CONDITIONS),
    threshold: thresholdSchema,
    cooldownMinutes: cooldownSchema,
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const alertIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const alertsQuerySchema = z.object({
  symbol: symbolSchema.optional(),
});
