import { formatDateTime, formatEnum, formatMoney, formatNumber, formatTimeUntil } from './format';

describe('format', () => {
  it('formats money with two decimals and grouping', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50');
    expect(formatMoney(0)).toBe('0.00');
  });

  it('formats local date and time', () => {
    const iso = '2026-03-04T05:06:00Z';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');

    expect(formatDateTime(iso)).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
    expect(formatDateTime(null)).toBe('—');
  });

  it('formats optional numbers', () => {
    expect(formatNumber(12.5, ' h')).toBe('12.5 h');
    expect(formatNumber(null, ' h')).toBe('—');
  });

  it('turns enum constants into labels', () => {
    expect(formatEnum('NO_LONGER_NEEDED')).toBe('No longer needed');
    expect(formatEnum('IN_FULFILMENT')).toBe('In fulfilment');
  });

  it('describes the time until a deadline', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');

    expect(formatTimeUntil('2026-01-01T00:14:10Z', now)).toBe('in 15 min');
    expect(formatTimeUntil('2026-01-01T00:00:40Z', now)).toBe('in 40 s');
    expect(formatTimeUntil('2025-12-31T23:59:00Z', now)).toBe('now');
  });
});
