import { useId, useState, type FormEvent } from 'react';
import { isConditionMet } from '@shared/alerts';
import {
  ALERT_CONDITIONS,
  ALERT_COOLDOWN_CHOICES,
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  type AlertCondition,
  type Quote,
} from '@shared/types';
import { useCreateAlert } from '../api/client';
import {
  alertErrorMessage,
  CONDITION_LABELS,
  cooldownLabel,
  isPercentCondition,
  thresholdError,
} from '../lib/alerts';
import { formatPercent, formatPrice } from '../lib/format';

interface Props {
  symbol: string;
  /** Used for the placeholder and the "already met" hint */
  quote?: Quote;
}

const fieldClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-900';

export function AlertForm({ symbol, quote }: Props) {
  const id = useId();
  const [condition, setCondition] = useState<AlertCondition>('price_below');
  const [threshold, setThreshold] = useState('');
  const [cooldown, setCooldown] = useState<number>(DEFAULT_ALERT_COOLDOWN_MINUTES);
  const [touched, setTouched] = useState(false);
  const create = useCreateAlert();

  const error = thresholdError(condition, threshold);
  const percent = isPercentCondition(condition);
  const value = Number(threshold);
  const metNow = !error && quote && isConditionMet({ condition, threshold: value }, quote);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    create.mutate(
      { symbol, condition, threshold: value, cooldownMinutes: cooldown },
      {
        onSuccess: () => {
          setThreshold('');
          setTouched(false);
        },
      },
    );
  }

  const placeholder = quote
    ? percent
      ? `วันนี้ ${formatPercent(quote.changePercent)}`
      : `ตอนนี้ ${formatPrice(quote.price)}`
    : percent
      ? 'เช่น 5'
      : 'ราคา';

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label="เพิ่มการแจ้งเตือน">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          เงื่อนไข
          <select
            className={`${fieldClass} mt-1`}
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value as AlertCondition);
              create.reset();
            }}
          >
            {ALERT_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
                {isPercentCondition(c) ? ' (%)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          {percent ? 'เปอร์เซ็นต์' : `ราคา${quote?.currency ? ` (${quote.currency})` : ''}`}
          <div className="relative mt-1">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              className={`${fieldClass} num ${percent ? 'pr-8' : ''}`}
              placeholder={placeholder}
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value);
                create.reset();
              }}
              onBlur={() => threshold !== '' && setTouched(true)}
              aria-invalid={touched && !!error}
              aria-describedby={`${id}-hint`}
            />
            {percent && (
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
                %
              </span>
            )}
          </div>
        </label>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          แจ้งซ้ำได้หลังจาก
          <select
            className={`${fieldClass} mt-1 sm:w-32`}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
          >
            {ALERT_COOLDOWN_CHOICES.map((m) => (
              <option key={m} value={m}>
                {cooldownLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {create.isPending ? 'กำลังบันทึก…' : 'เพิ่มการแจ้งเตือน'}
        </button>
        <p id={`${id}-hint`} aria-live="polite" className="text-xs">
          {touched && error ? (
            <span className="text-red-700 dark:text-red-400">{error}</span>
          ) : create.isError ? (
            <span className="text-red-700 dark:text-red-400">
              {alertErrorMessage(create.error)}
            </span>
          ) : metNow ? (
            <span className="text-amber-700 dark:text-amber-400">
              ตอนนี้เข้าเงื่อนไขอยู่แล้ว — จะแจ้งเตือนในรอบตรวจถัดไป
            </span>
          ) : create.isSuccess ? (
            <span className="text-emerald-700 dark:text-emerald-400">บันทึกแล้ว</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
