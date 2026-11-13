import { CHART_RANGES, type ChartRange } from '../lib/ranges';

interface Props {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}

export function RangeSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="ช่วงเวลา"
      className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
    >
      {CHART_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={`num rounded-md px-3 py-1 text-sm font-medium transition ${
            value === r
              ? 'bg-brand-700 text-white dark:bg-brand-600'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
