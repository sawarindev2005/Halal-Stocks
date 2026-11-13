const LOCALE = 'th-TH';

const priceFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat(LOCALE);
const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const EMPTY = '—';

export function formatPrice(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EMPTY : priceFmt.format(n);
}

/** Signed change, e.g. "+1.46" / "-0.30". */
export function formatChange(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EMPTY;
  return `${n > 0 ? '+' : ''}${priceFmt.format(n)}`;
}

/** Signed percent, e.g. "+0.43%". */
export function formatPercent(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EMPTY;
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** 59852690 → "59.85M" */
export function formatVolume(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EMPTY : compactFmt.format(n);
}

export function formatInteger(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EMPTY : intFmt.format(n);
}

export function formatTime(d: Date | number): string {
  return timeFmt.format(d);
}

/** Accepts a Date, epoch ms or an ISO / YYYY-MM-DD string. */
export function formatDate(d: Date | number | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(new Date(date).getTime()) ? EMPTY : dateFmt.format(date);
}

/** -1 / 0 / 1 for colouring price changes. */
export function direction(n: number | null | undefined): -1 | 0 | 1 {
  if (n == null || !Number.isFinite(n) || n === 0) return 0;
  return n > 0 ? 1 : -1;
}

const hmFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** "15:05" */
export function formatHm(d: Date | number | string): string {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? EMPTY : hmFmt.format(date);
}

/** "19 ต.ค. 2569 15:05" */
export function formatDateTime(d: Date | number | string): string {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? EMPTY : `${dateFmt.format(date)} ${hmFmt.format(date)}`;
}
