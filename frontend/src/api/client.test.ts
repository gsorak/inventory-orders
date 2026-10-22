import { ApiError, ordersApi, productsApi, reportsApi, reservationsApi, resolveApiBaseUrl } from './client';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } });
}

function lastCall(): [string, RequestInit & { headers: Record<string, string> }] {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('resolveApiBaseUrl', () => {
  it('uses an explicit absolute URL in any build, without a trailing slash', () => {
    expect(resolveApiBaseUrl('http://localhost:8080', true)).toBe('http://localhost:8080');
    expect(resolveApiBaseUrl(' https://api.example.com/ ', false)).toBe('https://api.example.com');
  });

  it('uses relative URLs when configured empty, for same-origin deployments', () => {
    expect(resolveApiBaseUrl('', true)).toBe('');
    expect(resolveApiBaseUrl('', false)).toBe('');
  });

  it('defaults to localhost only in development', () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe('http://localhost:8080');
    expect(resolveApiBaseUrl(undefined, false)).toBe('');
  });
});

describe('API client', () => {
  it('treats a missing demo catalogue as "not the public demo" and reports other failures', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, [{ sku: 'KB-MECH', name: 'Mechanical keyboard' }]));
    await expect(productsApi.demoCatalog()).resolves.toEqual([{ sku: 'KB-MECH', name: 'Mechanical keyboard' }]);
    expect(lastCall()[0]).toBe('http://localhost:8080/api/products/demo-catalog');

    mockFetch.mockResolvedValueOnce(jsonResponse(404, { code: 'NOT_FOUND' }));
    await expect(productsApi.demoCatalog()).resolves.toBeNull();

    mockFetch.mockResolvedValueOnce(jsonResponse(500, { code: 'INTERNAL_ERROR' }));
    await expect(productsApi.demoCatalog()).rejects.toBeInstanceOf(ApiError);
  });

  it('sends GET requests without a body or Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));

    await expect(productsApi.list()).resolves.toEqual([]);

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:8080/api/products');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('passes pagination parameters as a query string', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { items: [], page: 2, size: 10, totalElements: 0, totalPages: 0 }));

    await reservationsApi.list(2, 10);

    expect(lastCall()[0]).toBe('http://localhost:8080/api/reservations?page=2&size=10');
  });

  it('encodes report date parameters', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    await reportsApi.orderCycleTime('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');

    expect(lastCall()[0]).toBe(
      'http://localhost:8080/api/reports/order-cycle-time?from=2026-01-01T00%3A00%3A00Z&to=2026-02-01T00%3A00%3A00Z'
    );
  });

  it('sends JSON bodies and the Idempotency-Key header for supported operations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(201, { id: 9 }));

    await ordersApi.createShipment(3, { items: [{ orderItemId: 4, quantity: 2 }] }, 'key-1');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:8080/api/orders/3/shipments');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' });
    expect(JSON.parse(init.body as string)).toEqual({ items: [{ orderItemId: 4, quantity: 2 }] });
  });

  it('does not send an Idempotency-Key for other operations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(201, { id: 1 }));

    await reservationsApi.confirm(1, 'PAY-1');

    expect(lastCall()[1].headers['Idempotency-Key']).toBeUndefined();
  });

  it('turns problem details into an ApiError with code and field errors', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, {
        title: 'Bad Request',
        detail: 'Request validation failed',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'sku', message: 'must not be blank' }],
      })
    );

    const error = await productsApi.create({ sku: '', name: 'x', unitPrice: 1, lowStockThreshold: 0 }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.userMessage).toBe('sku: must not be blank');
  });

  it('uses the problem detail as message for business errors', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(409, { detail: 'Insufficient stock for product 3', code: 'INSUFFICIENT_STOCK' })
    );

    const error = await reservationsApi.create({ items: [{ productId: 3, quantity: 99 }] }, 'k').catch((e) => e);

    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.userMessage).toBe('Insufficient stock for product 3');
  });

  it('suggests retrying retryable conflicts', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(409, { detail: 'Lock conflict.', code: 'LOCK_CONFLICT', retryable: true }));

    const error = await reservationsApi.cancel(1).catch((e) => e);

    expect(error.userMessage).toBe('Lock conflict. Please try again.');
  });

  it('reports an unreachable backend', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await ordersApi.get(1).catch((e) => e);

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.userMessage).toContain('Could not reach the backend');
  });

  it('copes with error responses that are not JSON', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));

    const error = await ordersApi.get(1).catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.userMessage).toBe('Request failed (502)');
  });
});
