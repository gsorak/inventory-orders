import { expect, type APIRequestContext } from '@playwright/test';

/** Direct backend calls used to arrange test data; the behaviour under test is driven through the UI. */
/**
 * The E2E backend (../backend/start-e2e.sh) with its own throwaway database. Deliberately a constant: not read from
 * EXPO_PUBLIC_API_URL, so the tests can never be pointed at the development (8080) or a deployed backend.
 */
export const API_URL = 'http://localhost:8090';
/** The production build under test; must be in the backend's `app.cors.allowed-origins`. */
export const E2E_WEB_URL = 'http://localhost:8082';

export function uniqueSku(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

async function post<T>(request: APIRequestContext, path: string, data?: unknown): Promise<T> {
  const response = await request.post(`${API_URL}${path}`, { data });
  expect(response.ok(), `POST ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

export async function createProduct(
  request: APIRequestContext,
  { sku, price = '10.00', stock = 0, threshold = 0 }: { sku: string; price?: string; stock?: number; threshold?: number }
): Promise<number> {
  const product = await post<{ id: number }>(request, '/api/products', {
    sku,
    name: `E2E ${sku}`,
    unitPrice: Number(price),
    lowStockThreshold: threshold,
  });
  if (stock > 0) {
    await post(request, `/api/products/${product.id}/stock-receipts`, { quantity: stock });
  }
  return product.id;
}

interface OrderBody {
  id: number;
  reservationId: number;
  items: { id: number; productId: number }[];
}

export async function reserve(request: APIRequestContext, productId: number, quantity: number): Promise<number> {
  return (await post<{ id: number }>(request, '/api/reservations', { items: [{ productId, quantity }] })).id;
}

export async function placeOrder(request: APIRequestContext, productId: number, quantity: number): Promise<OrderBody> {
  const reservationId = await reserve(request, productId, quantity);
  return post<OrderBody>(request, `/api/reservations/${reservationId}/confirm`, { paymentReference: `E2E-${reservationId}` });
}

export async function deliver(request: APIRequestContext, orderId: number, orderItemId: number, quantity: number) {
  const shipment = await post<{ id: number }>(request, `/api/orders/${orderId}/shipments`, {
    items: [{ orderItemId, quantity }],
  });
  await post(request, `/api/shipments/${shipment.id}/ship`);
  await post(request, `/api/shipments/${shipment.id}/deliver`);
}

export async function stock(request: APIRequestContext, productId: number) {
  const response = await request.get(`${API_URL}/api/products/${productId}`);
  return ((await response.json()) as { stock: { onHand: number; reserved: number; available: number } }).stock;
}
