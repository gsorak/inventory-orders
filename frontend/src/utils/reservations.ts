import type { Reservation } from '../api/types';
import { formatDateTime } from './format';

export interface StockHold {
  /** Short state for lists. */
  label: string;
  /** What happened to the reserved stock, or what will happen to it. */
  detail: string;
}

/** Where the reserved units are, from the reservation's status and release timestamp. */
export function stockHold(reservation: Reservation): StockHold {
  switch (reservation.status) {
    case 'ACTIVE':
      return {
        label: 'Held',
        detail: `Held until ${formatDateTime(reservation.expiresAt)}. Released automatically if the payment is not confirmed by then.`,
      };
    case 'CONFIRMED':
      return {
        label: 'Held by order',
        detail: `Payment confirmed ${formatDateTime(reservation.confirmedAt)}. The order keeps the units reserved until they ship.`,
      };
    case 'CANCELLED':
      return {
        label: 'Released',
        detail: `Cancelled; the stock was released ${formatDateTime(reservation.stockReleasedAt)}.`,
      };
    case 'EXPIRED':
      return reservation.stockReleasedAt
        ? { label: 'Released', detail: `Expired without payment; the stock was released ${formatDateTime(reservation.stockReleasedAt)}.` }
        : { label: 'Release pending', detail: 'Expired without payment; the stock is released by the next background sweep.' };
    default:
      return { label: '—', detail: '' };
  }
}

export function reservedUnits(reservation: Reservation): number {
  return reservation.items.reduce((sum, item) => sum + item.quantity, 0);
}
