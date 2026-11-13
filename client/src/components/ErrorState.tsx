import { AlertIcon, RefreshIcon } from './icons';

interface Props {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Smaller inline banner instead of the full-page card */
  compact?: boolean;
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message,
  onRetry,
  retrying,
  compact,
}: Props) {
  const retry = onRetry && (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
    >
      <RefreshIcon className={retrying ? 'animate-spin' : ''} />
      ลองใหม่
    </button>
  );

  if (compact) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        <AlertIcon className="shrink-0 text-base" />
        <span className="flex-1">
          <strong className="font-semibold">{title}:</strong> {message}
        </span>
        {retry}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/60 dark:bg-red-950/30"
    >
      <AlertIcon className="text-3xl text-red-600 dark:text-red-400" />
      <h2 className="mt-3 font-semibold text-red-900 dark:text-red-100">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-red-800 dark:text-red-200">{message}</p>
      {retry && <div className="mt-5">{retry}</div>}
    </div>
  );
}
