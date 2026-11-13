import type { AlertCondition, AlertRule } from '@shared/types';
import { ApiRequestError } from '../api/client';
import { formatPrice } from './format';

export const CONDITION_LABELS: Record<AlertCondition, string> = {
  price_above: 'ราคาสูงกว่า',
  price_below: 'ราคาต่ำกว่า',
  change_up: 'วันนี้ขึ้นเกิน',
  change_down: 'วันนี้ลงเกิน',
};

export const isPercentCondition = (c: AlertCondition) => c === 'change_up' || c === 'change_down';

export const isUpCondition = (c: AlertCondition) => c === 'price_above' || c === 'change_up';

/** "ราคาต่ำกว่า 200.00" / "วันนี้ลงเกิน 5%" */
export function describeRule({ condition, threshold }: Pick<AlertRule, 'condition' | 'threshold'>) {
  const value = isPercentCondition(condition)
    ? `${Number(threshold.toFixed(2))}%`
    : formatPrice(threshold);
  return `${CONDITION_LABELS[condition]} ${value}`;
}

export function cooldownLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} วัน`;
  if (minutes % 60 === 0) return `${minutes / 60} ชั่วโมง`;
  return `${minutes} นาที`;
}

/** "*\/5 * * * *" → "ทุก 5 นาที"; anything else is shown as-is. */
export function scheduleLabel(expression: string): string {
  if (expression === '* * * * *') return 'ทุก 1 นาที';
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(expression);
  return m ? `ทุก ${m[1]} นาที` : expression;
}

/** Client-side check mirroring the API's rules, so the form can explain problems in Thai. */
export function thresholdError(condition: AlertCondition, raw: string): string | null {
  if (raw.trim() === '') return 'กรุณาใส่ตัวเลข';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'ต้องเป็นตัวเลข';
  if (n <= 0) return 'ต้องมากกว่า 0';
  if (condition === 'change_down' && n > 100) return 'ราคาลงในวันเดียวเกิน 100% ไม่ได้';
  if (n > 1e9) return 'ตัวเลขมากเกินไป';
  return null;
}

const ERROR_MESSAGES: Record<string, string> = {
  WEBHOOK_NOT_CONFIGURED: 'ยังไม่ได้ตั้ง DISCORD_WEBHOOK_URL ในไฟล์ .env',
  UNKNOWN_SYMBOL: 'หุ้นนี้ไม่อยู่ในรายชื่อหุ้นชาริอะห์ จึงตั้งแจ้งเตือนไม่ได้',
  ALERT_LIMIT_REACHED: 'ตั้งการแจ้งเตือนครบจำนวนสูงสุดแล้ว ลบกฎเก่าก่อน',
  ALERT_NOT_FOUND: 'ไม่พบกฎนี้แล้ว อาจถูกลบไปก่อนหน้า',
};

/** Thai message for an alerts API error; falls back to the server's own message. */
export function alertErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'DISCORD_ERROR') return `ส่งไป Discord ไม่สำเร็จ: ${err.message}`;
    return ERROR_MESSAGES[err.code] ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
