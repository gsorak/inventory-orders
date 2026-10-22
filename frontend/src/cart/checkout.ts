import type { Href } from 'expo-router';

import { ApiError } from '../api/client';
import type { CreateReservationRequest } from '../api/types';
import { newIdempotencyKey } from '../utils/idempotency';
import { loadJson, removeStored, saveJson } from '../utils/storage';

const STORAGE_KEY = 'inventory-orders.checkout';

/**
 * The checkout in progress, persisted so an interrupted checkout (lost response, refresh, closed tab) is resumed
 * with the same Idempotency-Key and therefore never creates a second reservation. While a record exists the cart
 * is locked; without a reservation id the outcome of the reservation request is still unknown.
 */
export interface CheckoutRecord {
  request: string;
  idempotencyKey: string;
  reservationId?: number;
}

export function loadCheckout(): CheckoutRecord | undefined {
  const value = loadJson(STORAGE_KEY) as Partial<CheckoutRecord> | undefined;
  if (typeof value?.request !== 'string' || typeof value.idempotencyKey !== 'string') {
    return undefined;
  }
  const reservationId = Number.isInteger(value.reservationId) ? value.reservationId : undefined;
  return { request: value.request, idempotencyKey: value.idempotencyKey, reservationId };
}

/** The key for submitting `request`: the stored one when the same cart is submitted again, otherwise a new one. */
export function checkoutKeyFor(request: CreateReservationRequest, generate: () => string = newIdempotencyKey): string {
  const serialized = JSON.stringify(request);
  const current = loadCheckout();
  if (current?.request === serialized) {
    return current.idempotencyKey;
  }
  return renewCheckoutKey(request, generate);
}

/** Starts a new checkout attempt for `request`, e.g. after the previous reservation for it expired. */
export function renewCheckoutKey(request: CreateReservationRequest, generate: () => string = newIdempotencyKey): string {
  const record: CheckoutRecord = { request: JSON.stringify(request), idempotencyKey: generate() };
  saveJson(STORAGE_KEY, record);
  return record.idempotencyKey;
}

export function recordReservation(reservationId: number): void {
  const current = loadCheckout();
  if (current) {
    saveJson(STORAGE_KEY, { ...current, reservationId });
  }
}

/** Forgets the checkout once its reservation is confirmed, cancelled or expired. */
export function finishCheckout(reservationId: number): void {
  if (loadCheckout()?.reservationId === reservationId) {
    removeStored(STORAGE_KEY);
  }
}

/** Forgets a checkout attempt that the backend rejected, so nothing was reserved. */
export function discardCheckout(): void {
  removeStored(STORAGE_KEY);
}

/** Whether a failed request may still have taken effect (no answer, or a server error), so its outcome must be checked. */
export function isOutcomeUnknown(error: unknown): boolean {
  return !(error instanceof ApiError) || error.code === 'NETWORK_ERROR' || error.status >= 500;
}

/** Where Cart leads: straight to the active checkout, so the cart page never adds a history entry in between. */
export function cartHref(checkout: CheckoutRecord | undefined): Href {
  return checkout?.reservationId === undefined
    ? '/cart'
    : { pathname: '/checkout/[id]', params: { id: String(checkout.reservationId) } };
}

/** Simulated payments use a reference derived from the reservation, so repeating a confirmation is idempotent. */
export function simulatedPaymentReference(reservationId: number): string {
  return `SIM-${reservationId}`;
}
