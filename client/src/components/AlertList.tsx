import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { isConditionMet } from '@shared/alerts';
import type { AlertRule, Quote } from '@shared/types';
import { useDeleteAlert, useUpdateAlert } from '../api/client';
import { alertErrorMessage, cooldownLabel, describeRule, isUpCondition } from '../lib/alerts';
import { formatDateTime, formatPercent, formatPrice } from '../lib/format';
import { TrashIcon } from './icons';

interface Props {
  alerts: AlertRule[];
  /** Show the symbol (with a link) on each row — for the page listing every alert */
  showSymbol?: boolean;
  /** Latest quotes by symbol, for the current price and the "condition met" badge */
  quotes?: Map<string, Quote>;
}

export function AlertList({ alerts, showSymbol = false, quotes }: Props) {
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="รายการแจ้งเตือน">
      {alerts.map((a) => (
        <AlertRow key={a.id} alert={a} showSymbol={showSymbol} quote={quotes?.get(a.symbol)} />
      ))}
    </ul>
  );
}

function AlertRow({
  alert,
  showSymbol,
  quote,
}: {
  alert: AlertRule;
  showSymbol: boolean;
  quote?: Quote;
}) {
  const update = useUpdateAlert();
  const remove = useDeleteAlert();
  const [confirming, setConfirming] = useState(false);

  // Drop the "confirm delete?" state if the user does not follow through.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const up = isUpCondition(alert.condition);
  const met = alert.active && quote && isConditionMet(alert, quote);
  const error = update.error ?? remove.error;
  const label = describeRule(alert);

  return (
    <li
      data-testid="alert-row"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${alert.active ? '' : 'opacity-60'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          {showSymbol && (
            <Link
              to={`/stock/${encodeURIComponent(alert.symbol)}`}
              className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
            >
              {alert.symbol}
            </Link>
          )}
          <span className={up ? 'text-up dark:text-green-400' : 'text-down dark:text-red-400'}>
            {up ? '▲' : '▼'}
          </span>
          <span className="num">{label}</span>
          {met && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              เข้าเงื่อนไขอยู่
            </span>
          )}
          {!alert.active && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              ปิดอยู่
            </span>
          )}
        </p>
        <p className="num mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {showSymbol && quote && (
            <>
              ตอนนี้ {formatPrice(quote.price)} ({formatPercent(quote.changePercent)}) ·{' '}
            </>
          )}
          แจ้งซ้ำได้หลัง {cooldownLabel(alert.cooldownMinutes)} ·{' '}
          {alert.lastTriggeredAt
            ? `แจ้งล่าสุด ${formatDateTime(alert.lastTriggeredAt)} ที่ ${formatPrice(alert.lastTriggeredPrice)}`
            : 'ยังไม่เคยแจ้ง'}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
            {alertErrorMessage(error)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={alert.active}
          aria-label={`${alert.active ? 'ปิด' : 'เปิด'}การแจ้งเตือน ${alert.symbol} ${label}`}
          title={alert.active ? 'เปิดอยู่ — กดเพื่อปิด' : 'ปิดอยู่ — กดเพื่อเปิด'}
          disabled={update.isPending}
          onClick={() => update.mutate({ id: alert.id, patch: { active: !alert.active } })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
            alert.active ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              alert.active ? 'translate-x-5' : ''
            }`}
          />
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => (confirming ? remove.mutate(alert.id) : setConfirming(true))}
          aria-label={confirming ? 'ยืนยันการลบ' : `ลบการแจ้งเตือน ${alert.symbol} ${label}`}
          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm transition disabled:opacity-60 ${
            confirming
              ? 'bg-red-600 font-medium text-white hover:bg-red-700'
              : 'text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800'
          }`}
        >
          <TrashIcon />
          {confirming && <span>ยืนยันลบ</span>}
        </button>
      </div>
    </li>
  );
}
