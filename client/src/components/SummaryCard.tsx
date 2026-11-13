import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

interface Props {
  title: string;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}

export function SummaryCard({ title, children, loading, className = '' }: Props) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="mt-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Label/value row used inside summary cards. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'up' | 'down';
}) {
  const color =
    tone === 'up'
      ? 'text-up dark:text-green-400'
      : tone === 'down'
        ? 'text-down dark:text-red-400'
        : '';
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 whitespace-nowrap text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`num text-right font-medium ${color}`}>{value}</span>
    </div>
  );
}
