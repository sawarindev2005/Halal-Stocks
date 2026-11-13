import { formatPrice } from '../lib/format';
import { MA_COLORS, MA_PERIODS, type MaPeriod } from '../lib/ranges';

interface Props {
  enabled: Set<MaPeriod>;
  onToggle: (period: MaPeriod) => void;
  /** Latest value of each MA, shown next to its label */
  latest: Partial<Record<MaPeriod, number>>;
}

export function MaToggles({ enabled, onToggle, latest }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="เส้นค่าเฉลี่ยเคลื่อนที่">
      {MA_PERIODS.map((period) => {
        const on = enabled.has(period);
        return (
          <button
            key={period}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(period)}
            className={`num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              on
                ? 'border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
                : 'border-dashed border-slate-300 text-slate-400 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: on ? MA_COLORS[period] : 'transparent',
                boxShadow: `inset 0 0 0 1.5px ${MA_COLORS[period]}`,
              }}
              aria-hidden="true"
            />
            MA{period}
            {on && latest[period] !== undefined && (
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {formatPrice(latest[period])}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
