const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  return money.format(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local date and time as YYYY-MM-DD HH:mm; a dash for missing values. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(value: number | null | undefined, unit = ''): string {
  return value === null || value === undefined ? '—' : `${value}${unit}`;
}

/** Turns an enum constant such as NO_LONGER_NEEDED into "No longer needed". */
export function formatEnum(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "in 14 min", "in 40 s" or "now" relative to `now`; used for reservation expiry countdowns. */
export function formatTimeUntil(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (seconds <= 0) {
    return 'now';
  }
  return seconds < 60 ? `in ${seconds} s` : `in ${Math.ceil(seconds / 60)} min`;
}
