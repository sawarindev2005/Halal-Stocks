import type { AlertRule, Quote } from './types';

/** Shared by the server's alert checker and the UI's "condition met now" hint. */
export function isConditionMet(
  rule: Pick<AlertRule, 'condition' | 'threshold'>,
  quote: Pick<Quote, 'price' | 'changePercent'>,
): boolean {
  switch (rule.condition) {
    case 'price_above':
      return quote.price > rule.threshold;
    case 'price_below':
      return quote.price < rule.threshold;
    case 'change_up':
      return quote.changePercent >= rule.threshold;
    case 'change_down':
      return quote.changePercent <= -rule.threshold;
  }
}
