import { describe, expect, it } from 'vitest';
import { isConditionMet } from '@shared/alerts';
import { ApiRequestError } from '../api/client';
import {
  alertErrorMessage,
  cooldownLabel,
  describeRule,
  scheduleLabel,
  thresholdError,
} from '../lib/alerts';

describe('describeRule', () => {
  it('formats price rules as prices and change rules as percents', () => {
    expect(describeRule({ condition: 'price_below', threshold: 200 })).toBe('ราคาต่ำกว่า 200.00');
    expect(describeRule({ condition: 'price_above', threshold: 1234.5 })).toBe(
      'ราคาสูงกว่า 1,234.50',
    );
    expect(describeRule({ condition: 'change_down', threshold: 5 })).toBe('วันนี้ลงเกิน 5%');
    expect(describeRule({ condition: 'change_up', threshold: 2.555 })).toBe('วันนี้ขึ้นเกิน 2.56%');
  });
});

describe('cooldownLabel', () => {
  it.each([
    [60, '1 ชั่วโมง'],
    [240, '4 ชั่วโมง'],
    [1440, '1 วัน'],
    [2880, '2 วัน'],
    [90, '90 นาที'],
  ])('%d → %s', (minutes, label) => {
    expect(cooldownLabel(minutes)).toBe(label);
  });
});

describe('scheduleLabel', () => {
  it('reads simple "every N minutes" patterns and leaves others alone', () => {
    expect(scheduleLabel('*/5 * * * *')).toBe('ทุก 5 นาที');
    expect(scheduleLabel('* * * * *')).toBe('ทุก 1 นาที');
    expect(scheduleLabel('0 9 * * 1-5')).toBe('0 9 * * 1-5');
  });
});

describe('thresholdError', () => {
  it('accepts positive numbers', () => {
    expect(thresholdError('price_below', '199.5')).toBeNull();
    expect(thresholdError('change_down', '100')).toBeNull();
  });

  it.each([
    ['price_below', '', 'กรุณาใส่ตัวเลข'],
    ['price_below', 'abc', 'ต้องเป็นตัวเลข'],
    ['price_below', '0', 'ต้องมากกว่า 0'],
    ['change_up', '-3', 'ต้องมากกว่า 0'],
    ['change_down', '101', 'ราคาลงในวันเดียวเกิน 100% ไม่ได้'],
  ] as const)('%s "%s" → %s', (condition, raw, message) => {
    expect(thresholdError(condition, raw)).toBe(message);
  });
});

describe('alertErrorMessage', () => {
  it('translates known API error codes', () => {
    expect(alertErrorMessage(new ApiRequestError(409, 'WEBHOOK_NOT_CONFIGURED', 'x'))).toMatch(
      /DISCORD_WEBHOOK_URL/,
    );
    expect(alertErrorMessage(new ApiRequestError(502, 'DISCORD_ERROR', 'HTTP 404'))).toBe(
      'ส่งไป Discord ไม่สำเร็จ: HTTP 404',
    );
  });

  it("falls back to the server's message", () => {
    expect(alertErrorMessage(new ApiRequestError(500, 'INTERNAL_ERROR', 'boom'))).toBe('boom');
  });
});

describe('isConditionMet (shared with the server)', () => {
  const q = { price: 190, changePercent: -6 };
  it('matches the rule semantics', () => {
    expect(isConditionMet({ condition: 'price_below', threshold: 200 }, q)).toBe(true);
    expect(isConditionMet({ condition: 'price_above', threshold: 200 }, q)).toBe(false);
    expect(isConditionMet({ condition: 'change_down', threshold: 5 }, q)).toBe(true);
    expect(isConditionMet({ condition: 'change_up', threshold: 5 }, q)).toBe(false);
  });
});
