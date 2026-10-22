import { reservation } from '../test-utils/fixtures';
import { reservedUnits, stockHold } from './reservations';

describe('stockHold', () => {
  it('describes where the reserved units are for every status', () => {
    expect(stockHold(reservation()).label).toBe('Held');
    expect(stockHold(reservation({ status: 'CONFIRMED', confirmedAt: '2026-01-01T10:02:00Z' })).label).toBe('Held by order');
    expect(stockHold(reservation({ status: 'CANCELLED', stockReleasedAt: '2026-01-01T10:01:00Z' })).label).toBe('Released');
    expect(stockHold(reservation({ status: 'EXPIRED' })).label).toBe('Release pending');
    expect(stockHold(reservation({ status: 'EXPIRED', stockReleasedAt: '2026-01-01T10:16:00Z' })).label).toBe('Released');
  });

  it('counts reserved units across lines', () => {
    expect(
      reservedUnits(
        reservation({
          items: [
            { productId: 1, quantity: 2, unitPrice: 1, lineTotal: 2 },
            { productId: 2, quantity: 3, unitPrice: 1, lineTotal: 3 },
          ],
        })
      )
    ).toBe(5);
  });
});
