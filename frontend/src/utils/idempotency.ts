import { useState } from 'react';

/** Random key for the Idempotency-Key header (uniqueness, not secrecy, is what matters). */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Tracks the idempotency key of one form's operation: retrying an identical request reuses the key, so a
 * request that reached the backend but whose response was lost is not executed twice. Changing the request
 * starts a new operation with a new key, as does calling {@link IdempotencyKeyTracker.complete} after success.
 */
export class IdempotencyKeyTracker {
  private current?: { request: string; key: string };

  constructor(private readonly generate: () => string = newIdempotencyKey) {}

  keyFor(request: unknown): string {
    const serialized = JSON.stringify(request);
    if (this.current?.request !== serialized) {
      this.current = { request: serialized, key: this.generate() };
    }
    return this.current.key;
  }

  complete(): void {
    this.current = undefined;
  }
}

export function useIdempotencyKeys(): IdempotencyKeyTracker {
  const [tracker] = useState(() => new IdempotencyKeyTracker());
  return tracker;
}
