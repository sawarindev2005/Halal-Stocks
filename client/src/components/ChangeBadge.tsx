import { direction, EMPTY, formatPercent } from '../lib/format';

const styles = {
  1: 'bg-up-soft text-up dark:bg-up/15 dark:text-green-400',
  [-1]: 'bg-down-soft text-down dark:bg-down/15 dark:text-red-400',
  0: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
} as const;

export function ChangeBadge({ percent }: { percent: number | null | undefined }) {
  if (percent == null || !Number.isFinite(percent)) {
    return <span className="text-slate-400 dark:text-slate-500">{EMPTY}</span>;
  }
  return (
    <span
      className={`num inline-block min-w-[3.75rem] rounded-md px-1.5 py-0.5 text-right text-sm font-medium sm:min-w-[4.75rem] sm:px-2 ${styles[direction(percent)]}`}
    >
      {formatPercent(percent)}
    </span>
  );
}
