import { Link } from 'react-router';
import type { Quote } from '@shared/types';
import { useAlerts } from '../api/client';
import { AlertForm } from './AlertForm';
import { AlertList } from './AlertList';
import { ErrorState } from './ErrorState';
import { AlertIcon, BellIcon } from './icons';
import { Skeleton } from './Skeleton';
import { WebhookStatus } from './WebhookStatus';

interface Props {
  symbol: string;
  quote?: Quote;
  /** Only stocks in the Shariah list can have alerts */
  inList: boolean;
}

/** "Price alerts" card on the stock page: the stock's rules, the add form and Discord status. */
export function StockAlerts({ symbol, quote, inList }: Props) {
  const alerts = useAlerts(symbol);

  return (
    <section
      aria-labelledby="stock-alerts-title"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="stock-alerts-title" className="flex items-center gap-2 font-semibold">
          <BellIcon className="text-brand-600 dark:text-brand-400" /> แจ้งเตือนราคาผ่าน Discord
        </h2>
        <Link to="/alerts" className="text-sm text-brand-700 hover:underline dark:text-brand-400">
          ดูทั้งหมด
        </Link>
      </div>

      {!inList ? (
        <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertIcon className="mt-0.5 shrink-0" />
          ตั้งแจ้งเตือนได้เฉพาะหุ้นที่อยู่ในรายชื่อหุ้นชาริอะห์
        </p>
      ) : (
        <>
          <WebhookStatus />

          {alerts.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : alerts.isError ? (
            <ErrorState
              compact
              title="โหลดการแจ้งเตือนไม่สำเร็จ"
              message={alerts.error.message}
              onRetry={() => void alerts.refetch()}
              retrying={alerts.isFetching}
            />
          ) : alerts.data.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              ยังไม่มีการแจ้งเตือนสำหรับ {symbol}
            </p>
          ) : (
            <AlertList
              alerts={alerts.data}
              quotes={quote ? new Map([[symbol, quote]]) : undefined}
            />
          )}

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <AlertForm symbol={symbol} quote={quote} />
          </div>
        </>
      )}
    </section>
  );
}
