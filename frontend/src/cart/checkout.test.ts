import { ApiError } from '../api/client';
import { clearMemoryStore } from '../utils/storage';
import {
  cartHref,
  checkoutKeyFor,
  discardCheckout,
  finishCheckout,
  isOutcomeUnknown,
  loadCheckout,
  recordReservation,
  renewCheckoutKey,
  simulatedPaymentReference,
} from './checkout';

const request = { items: [{ productId: 1, quantity: 2 }] };
const keys = () => {
  let n = 0;
  return () => `key-${++n}`;
};

beforeEach(() => clearMemoryStore());

describe('checkout record', () => {
  it('reuses the stored key for the same cart and uses a new key when the cart changes', () => {
    const generate = keys();
    expect(checkoutKeyFor(request, generate)).toBe('key-1');
    expect(checkoutKeyFor({ items: [{ productId: 1, quantity: 2 }] }, generate)).toBe('key-1');
    expect(checkoutKeyFor({ items: [{ productId: 1, quantity: 3 }] }, generate)).toBe('key-2');
  });

  it('keeps the key and reservation id in storage, so a reload resumes the same checkout', () => {
    const generate = keys();
    checkoutKeyFor(request, generate);
    recordReservation(3);

    expect(loadCheckout()).toEqual({ request: JSON.stringify(request), idempotencyKey: 'key-1', reservationId: 3 });
    expect(checkoutKeyFor(request, generate)).toBe('key-1');
  });

  it('starts a new attempt for the same cart only when asked to', () => {
    const generate = keys();
    checkoutKeyFor(request, generate);
    expect(renewCheckoutKey(request, generate)).toBe('key-2');
    expect(checkoutKeyFor(request, generate)).toBe('key-2');
  });

  it('forgets the checkout only when its own reservation finishes', () => {
    checkoutKeyFor(request, keys());
    recordReservation(3);

    finishCheckout(4);
    expect(loadCheckout()?.reservationId).toBe(3);
    finishCheckout(3);
    expect(loadCheckout()).toBeUndefined();
  });

  it('discards a checkout whose reservation request was definitely rejected', () => {
    checkoutKeyFor(request, keys());
    discardCheckout();
    expect(loadCheckout()).toBeUndefined();
  });

  it('treats lost responses and server failures as unknown outcomes, and rejections as definite', () => {
    expect(isOutcomeUnknown(new ApiError(0, 'NETWORK_ERROR', 'Offline.'))).toBe(true);
    expect(isOutcomeUnknown(new ApiError(503, 'UNAVAILABLE', 'Down.'))).toBe(true);
    expect(isOutcomeUnknown(new Error('boom'))).toBe(true);
    expect(isOutcomeUnknown(new ApiError(409, 'INSUFFICIENT_STOCK', 'No stock.'))).toBe(false);
    expect(isOutcomeUnknown(new ApiError(400, 'VALIDATION_FAILED', 'Bad.'))).toBe(false);
  });

  it('points Cart at the active checkout once its reservation is known', () => {
    expect(cartHref(undefined)).toBe('/cart');
    expect(cartHref({ request: '{}', idempotencyKey: 'k' })).toBe('/cart');
    expect(cartHref({ request: '{}', idempotencyKey: 'k', reservationId: 3 })).toEqual({
      pathname: '/checkout/[id]',
      params: { id: '3' },
    });
  });

  it('derives a stable simulated payment reference', () => {
    expect(simulatedPaymentReference(3)).toBe('SIM-3');
  });
});
