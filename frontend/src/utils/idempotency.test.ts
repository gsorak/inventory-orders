import { IdempotencyKeyTracker, newIdempotencyKey } from './idempotency';

function trackerWithSequentialKeys() {
  let counter = 0;
  return new IdempotencyKeyTracker(() => `key-${++counter}`);
}

describe('IdempotencyKeyTracker', () => {
  it('reuses the key when an identical request is retried', () => {
    const tracker = trackerWithSequentialKeys();

    expect(tracker.keyFor({ items: [{ productId: 1, quantity: 2 }] })).toBe('key-1');
    expect(tracker.keyFor({ items: [{ productId: 1, quantity: 2 }] })).toBe('key-1');
  });

  it('generates a new key when the request changes', () => {
    const tracker = trackerWithSequentialKeys();

    tracker.keyFor({ items: [{ productId: 1, quantity: 2 }] });

    expect(tracker.keyFor({ items: [{ productId: 1, quantity: 3 }] })).toBe('key-2');
  });

  it('generates a new key for the next operation after completion', () => {
    const tracker = trackerWithSequentialKeys();
    tracker.keyFor({ orderId: 1 });

    tracker.complete();

    expect(tracker.keyFor({ orderId: 1 })).toBe('key-2');
  });

  it('creates distinct random keys accepted by the backend (1-100 characters)', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(100);
  });
});
