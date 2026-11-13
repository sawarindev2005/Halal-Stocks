import { useAlertStatus, useCheckAlertsNow, useTestWebhook } from '../api/client';
import { alertErrorMessage, scheduleLabel } from '../lib/alerts';
import { formatHm } from '../lib/format';
import { ErrorState } from './ErrorState';
import { AlertIcon, CheckIcon, RefreshIcon, SendIcon } from './icons';
import { Skeleton } from './Skeleton';

const buttonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

interface Props {
  /** Also offer "check now" (the alerts page); the stock page only needs the test button. */
  showCheckNow?: boolean;
}

/** Whether Discord is connected, when the next check runs, and test / check-now actions. */
export function WebhookStatus({ showCheckNow = false }: Props) {
  const status = useAlertStatus();
  const test = useTestWebhook();
  const check = useCheckAlertsNow();

  if (status.isPending) return <Skeleton className="h-11 w-full" />;
  if (status.isError) {
    return (
      <ErrorState
        compact
        title="โหลดสถานะการแจ้งเตือนไม่สำเร็จ"
        message={status.error.message}
        onRetry={() => void status.refetch()}
        retrying={status.isFetching}
      />
    );
  }

  const { webhookConfigured, schedule, nextCheckAt, lastCheck } = status.data;

  if (!webhookConfigured) {
    return (
      <div
        role="status"
        data-testid="webhook-missing"
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <p className="flex items-center gap-1.5 font-semibold">
          <AlertIcon className="shrink-0" /> ยังไม่ได้เชื่อมต่อ Discord
        </p>
        <p className="mt-1">
          กฎที่ตั้งไว้จะถูกบันทึก แต่จะยังไม่ส่งแจ้งเตือน — ใส่{' '}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">
            DISCORD_WEBHOOK_URL
          </code>{' '}
          ในไฟล์ <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">.env</code>{' '}
          แล้วรีสตาร์ต{' '}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">npm run dev</code>{' '}
          (ดูวิธีใน docs/discord-webhook-setup.md)
        </p>
      </div>
    );
  }

  const lastErrors = lastCheck?.errors ?? [];

  return (
    <div
      data-testid="webhook-status"
      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-800/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckIcon /> เชื่อมต่อ Discord แล้ว
          </span>
          <span>· ตรวจราคา{scheduleLabel(schedule)}</span>
          {nextCheckAt && <span>· รอบถัดไป {formatHm(nextCheckAt)}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {showCheckNow && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => check.mutate()}
              disabled={check.isPending}
            >
              <RefreshIcon className={check.isPending ? 'animate-spin' : ''} /> ตรวจตอนนี้
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            <SendIcon className={test.isPending ? 'animate-pulse' : ''} /> ส่งข้อความทดสอบ
          </button>
        </div>
      </div>

      <div aria-live="polite" className="space-y-1 text-xs">
        {test.isSuccess && (
          <p className="text-emerald-700 dark:text-emerald-400">
            ส่งข้อความทดสอบแล้ว — ดูในห้อง Discord ของคุณ
          </p>
        )}
        {test.isError && (
          <p className="text-red-700 dark:text-red-400">{alertErrorMessage(test.error)}</p>
        )}
        {check.isSuccess && (
          <p className="text-slate-600 dark:text-slate-300">
            ตรวจแล้ว {check.data.checked} กฎ · ส่งแจ้งเตือน {check.data.triggered} ข้อความ
            {check.data.triggered === 0 && ' (ไม่มีกฎที่เข้าเงื่อนไข หรือยังอยู่ในช่วงพัก)'}
          </p>
        )}
        {check.isError && (
          <p className="text-red-700 dark:text-red-400">{alertErrorMessage(check.error)}</p>
        )}
        {lastErrors.length > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            รอบล่าสุด ({formatHm(lastCheck!.finishedAt)}) มีปัญหา:{' '}
            {lastErrors.map((e) => `${e.symbol} — ${e.message}`).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
