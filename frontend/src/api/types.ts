/** Types mirroring the backend's JSON contracts. Money values are JSON numbers with two decimals. */

export interface StockLevels {
  onHand: number;
  reserved: number;
  available: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  unitPrice: number;
  lowStockThreshold: number;
  stock: StockLevels;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  unitPrice: number;
  lowStockThreshold: number;
}

/** A product visitors of the public demo may create; SKU and name are fixed. */
export interface ProductTemplate {
  sku: string;
  name: string;
}

export interface StockReceipt {
  id: number;
  productId: number;
  quantity: number;
  source: 'PURCHASE' | 'RETURN';
  receivedAt: string;
  stock: StockLevels;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type ReservationStatus = 'ACTIVE' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface Reservation {
  id: number;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  stockReleasedAt: string | null;
  total: number;
  items: { productId: number; quantity: number; unitPrice: number; lineTotal: number }[];
}

export interface CreateReservationRequest {
  items: { productId: number; quantity: number }[];
}

export type OrderStatus = 'CONFIRMED' | 'IN_FULFILMENT' | 'DELIVERED';

export interface OrderItem {
  id: number;
  productId: number;
  unitPrice: number;
  quantity: number;
  packedQuantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  returnedQuantity: number;
  lineTotal: number;
}

export interface Order {
  id: number;
  reservationId: number;
  paymentReference: string;
  status: OrderStatus;
  confirmedAt: string;
  deliveredAt: string | null;
  grossTotal: number;
  creditedTotal: number;
  netTotal: number;
  items: OrderItem[];
}

export type ShipmentStatus = 'PACKED' | 'SHIPPED' | 'DELIVERED';

export interface Shipment {
  id: number;
  orderId: number;
  status: ShipmentStatus;
  packedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: { orderItemId: number; productId: number; quantity: number }[];
}

export interface CreateShipmentRequest {
  items: { orderItemId: number; quantity: number }[];
}

export const RETURN_REASONS = ['NO_LONGER_NEEDED', 'WRONG_ITEM_SENT', 'DEFECTIVE', 'DAMAGED_IN_TRANSIT'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const ITEM_CONDITIONS = ['UNOPENED', 'OPENED', 'DAMAGED'] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export interface CreateReturnRequest {
  items: { orderItemId: number; quantity: number; reason: ReturnReason; condition: ItemCondition }[];
}

export interface OrderReturn {
  id: number;
  orderId: number;
  returnedAt: string;
  items: {
    orderItemId: number;
    productId: number;
    quantity: number;
    reason: ReturnReason;
    condition: ItemCondition;
    disposition: 'RESTOCK' | 'DISCARD';
    refundAmount: number;
  }[];
  creditNote: { number: string; amount: number; issuedAt: string };
  orderTotals: { grossTotal: number; creditedTotal: number; netTotal: number };
}

export interface LowStockReport {
  items: {
    productId: number;
    sku: string;
    name: string;
    onHand: number;
    reserved: number;
    available: number;
    lowStockThreshold: number;
  }[];
}

export interface InventoryAgingReport {
  asOf: string;
  method: string;
  products: {
    productId: number;
    sku: string;
    name: string;
    onHand: number;
    unitsByAge: { days0To30: number; days31To60: number; days61To90: number; over90Days: number };
    averageAgeDays: number | null;
    oldestUnitAgeDays: number | null;
  }[];
}

export interface OrderCycleTimeReport {
  from: string;
  to: string;
  deliveredOrders: number;
  averageHours: number | null;
  medianHours: number | null;
  p90Hours: number | null;
  minHours: number | null;
  maxHours: number | null;
}
