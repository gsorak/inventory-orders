import type {
  CreateProductRequest,
  CreateReservationRequest,
  CreateReturnRequest,
  CreateShipmentRequest,
  InventoryAgingReport,
  LowStockReport,
  Order,
  OrderCycleTimeReport,
  OrderReturn,
  Page,
  Product,
  ProductTemplate,
  Reservation,
  Shipment,
  StockReceipt,
} from './types';

/**
 * Resolves the API base URL from EXPO_PUBLIC_API_URL, which Expo inlines at build time:
 * - non-empty: absolute backend URL, e.g. http://localhost:8080 for local development (allowed by backend CORS);
 *   Android emulator: http://10.0.2.2:8080
 * - empty: relative /api/... URLs, for a frontend and backend served from one origin (CloudFront: /api/* → backend)
 * - unset: localhost:8080 in development, relative in production builds, so a release never targets localhost
 */
export function resolveApiBaseUrl(configured: string | undefined, isDev: boolean): string {
  if (configured === undefined) {
    return isDev ? 'http://localhost:8080' : '';
  }
  return configured.trim().replace(/\/+$/, '');
}

// Must stay a literal process.env.EXPO_PUBLIC_* access, or Expo cannot inline it.
export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);

const API_LOCATION = API_BASE_URL || 'this site (/api)';

export interface FieldError {
  field: string;
  message: string;
}

/** Error raised for any failed request; mirrors the backend's RFC 9457 problem details. */
export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable backend error code, e.g. INSUFFICIENT_STOCK; NETWORK_ERROR when unreachable. */
  readonly code: string;
  readonly detail?: string;
  readonly fieldErrors: FieldError[];
  readonly retryable: boolean;

  constructor(status: number, code: string, detail?: string, fieldErrors: FieldError[] = [], retryable = false) {
    super(detail ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }

  /** Human-readable summary suitable for display. */
  get userMessage(): string {
    if (this.fieldErrors.length > 0) {
      return this.fieldErrors.map((e) => `${e.field}: ${e.message}`).join('\n');
    }
    const message = this.detail ?? `Request failed (${this.status})`;
    return this.retryable ? `${message} Please try again.` : message;
  }
}

/** Extracts a display message from anything thrown by the API client. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.userMessage : fallback;
}

interface ProblemDetail {
  title?: string;
  detail?: string;
  code?: string;
  errors?: FieldError[];
  retryable?: boolean;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
}

async function request<T>(path: string, { method = 'GET', body, idempotencyKey }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Could not reach the backend at ${API_LOCATION}. Is it running?`);
  }

  if (!response.ok) {
    let problem: ProblemDetail = {};
    try {
      problem = (await response.json()) as ProblemDetail;
    } catch {
      // Not JSON: keep the empty problem and report the status only.
    }
    throw new ApiError(
      response.status,
      problem.code ?? 'ERROR',
      problem.detail ?? problem.title,
      problem.errors ?? [],
      problem.retryable ?? false
    );
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

export const productsApi = {
  list: () => request<Product[]>('/api/products'),
  create: (body: CreateProductRequest) => request<Product>('/api/products', { method: 'POST', body }),
  /** Catalogue entries not created yet in the public demo; null when the backend is not the public demo. */
  demoCatalog: async (): Promise<ProductTemplate[] | null> => {
    try {
      return await request<ProductTemplate[]>('/api/products/demo-catalog');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return null;
      }
      throw e;
    }
  },
  receiveStock: (productId: number, quantity: number) =>
    request<StockReceipt>(`/api/products/${productId}/stock-receipts`, { method: 'POST', body: { quantity } }),
};

export const reservationsApi = {
  list: (page: number, size: number) => request<Page<Reservation>>(`/api/reservations?${query({ page, size })}`),
  get: (id: number) => request<Reservation>(`/api/reservations/${id}`),
  create: (body: CreateReservationRequest, idempotencyKey: string) =>
    request<Reservation>('/api/reservations', { method: 'POST', body, idempotencyKey }),
  cancel: (id: number) => request<Reservation>(`/api/reservations/${id}/cancel`, { method: 'POST' }),
  confirm: (id: number, paymentReference: string) =>
    request<Order>(`/api/reservations/${id}/confirm`, { method: 'POST', body: { paymentReference } }),
  /** The order created by confirming the reservation; 404 until it is confirmed. */
  order: (id: number) => request<Order>(`/api/reservations/${id}/order`),
};

export const ordersApi = {
  list: (page: number, size: number) => request<Page<Order>>(`/api/orders?${query({ page, size })}`),
  get: (id: number) => request<Order>(`/api/orders/${id}`),
  shipments: (orderId: number) => request<Shipment[]>(`/api/orders/${orderId}/shipments`),
  returns: (orderId: number) => request<OrderReturn[]>(`/api/orders/${orderId}/returns`),
  createShipment: (orderId: number, body: CreateShipmentRequest, idempotencyKey: string) =>
    request<Shipment>(`/api/orders/${orderId}/shipments`, { method: 'POST', body, idempotencyKey }),
  createReturn: (orderId: number, body: CreateReturnRequest, idempotencyKey: string) =>
    request<OrderReturn>(`/api/orders/${orderId}/returns`, { method: 'POST', body, idempotencyKey }),
};

export const shipmentsApi = {
  ship: (id: number) => request<Shipment>(`/api/shipments/${id}/ship`, { method: 'POST' }),
  deliver: (id: number) => request<Shipment>(`/api/shipments/${id}/deliver`, { method: 'POST' }),
};

export const reportsApi = {
  lowStock: () => request<LowStockReport>('/api/reports/low-stock'),
  inventoryAging: () => request<InventoryAgingReport>('/api/reports/inventory-aging'),
  orderCycleTime: (from: string, to: string) =>
    request<OrderCycleTimeReport>(`/api/reports/order-cycle-time?${query({ from, to })}`),
};
