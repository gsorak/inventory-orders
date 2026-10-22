import type { Order, OrderItem, Product, Reservation, Shipment } from '../api/types';

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'LAMP-001',
    name: 'Desk lamp',
    unitPrice: 19.95,
    lowStockThreshold: 5,
    stock: { onHand: 10, reserved: 0, available: 10 },
    ...overrides,
  };
}

export function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 3,
    status: 'ACTIVE',
    createdAt: '2026-01-01T10:00:00Z',
    expiresAt: '2026-01-01T10:15:00Z',
    confirmedAt: null,
    stockReleasedAt: null,
    total: 39.9,
    items: [{ productId: 1, quantity: 2, unitPrice: 19.95, lineTotal: 39.9 }],
    ...overrides,
  };
}

export function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 11,
    productId: 1,
    unitPrice: 19.95,
    quantity: 3,
    packedQuantity: 0,
    shippedQuantity: 0,
    deliveredQuantity: 0,
    returnedQuantity: 0,
    lineTotal: 59.85,
    ...overrides,
  };
}

export function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 7,
    reservationId: 3,
    paymentReference: 'PAY-3',
    status: 'CONFIRMED',
    confirmedAt: '2026-01-01T10:05:00Z',
    deliveredAt: null,
    grossTotal: 59.85,
    creditedTotal: 0,
    netTotal: 59.85,
    items: [orderItem()],
    ...overrides,
  };
}

export function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: 5,
    orderId: 7,
    status: 'PACKED',
    packedAt: '2026-01-01T11:00:00Z',
    shippedAt: null,
    deliveredAt: null,
    items: [{ orderItemId: 11, productId: 1, quantity: 2 }],
    ...overrides,
  };
}
