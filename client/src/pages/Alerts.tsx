import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Quote } from '@shared/types';
import { useAlerts, useQuotes } from '../api/client';
import { AlertList } from '../components/AlertList';
import { ErrorState } from '../components/ErrorState';
import { BellIcon } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { WebhookStatus } from '../components/WebhookStatus';

/** Every alert rule, with live prices and the Discord connection status. */
export function Alerts() {
  const alerts = useAlerts();
  const symbols = useMemo(
    () => [...new Set((alerts.data ?? []).map((a) => a.symbol))],
    [alerts.data],
  );
  const quotes = useQuotes(symbols);
  const quoteMap = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const r of quotes.data ?? []) if (r.ok) map.set(r.symbol, r.quote);
    return map;
  }, [quotes.data]);

  const activeCount = alerts.data?.filter((a) => a.active).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BellIcon className="text-brand-600 dark:text-brand-400" /> การแจ้งเตือน
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ระบบตรวจราคาเป็นระยะและส่งข้อความเข้า Discord เมื่อเข้าเงื่อนไข — ทำงานเฉพาะตอนที่ server
          เปิดอยู่
        </p>
      </div>

      <WebhookStatus showCheckNow />

      <section className="rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        {alerts.isPending ? (
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : alerts.isError ? (
          <div className="py-4">
            <ErrorState
              message={alerts.error.message}
              onRetry={() => void alerts.refetch()}
              retrying={alerts.isFetching}
            />
          </div>
        ) : alerts.data.length === 0 ? (
          <div className="py-12 text-center">
            <BellIcon className="mx-auto text-3xl text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-medium">ยังไม่มีการแจ้งเตือน</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              เลือกหุ้นจาก Watchlist แล้วตั้งแจ้งเตือนในหน้ารายละเอียดหุ้น
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              ไปที่ Watchlist
            </Link>
          </div>
        ) : (
          <>
            <p className="border-b border-slate-200 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {alerts.data.length} กฎ · เปิดอยู่ {activeCount}
            </p>
            <AlertList alerts={alerts.data} showSymbol quotes={quoteMap} />
          </>
        )}
      </section>
    </div>
  );
}
