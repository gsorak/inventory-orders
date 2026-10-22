import type { CreateReservationRequest, Product } from '../api/types';

/**
 * A cart line keeps a snapshot of the product for display; prices and availability are refreshed from the
 * backend before checkout, and the reservation's own prices and totals are authoritative after that.
 */
export interface CartLine {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export type Cart = CartLine[];

const cents = (amount: number) => Math.round(amount * 100);

export function lineTotal(line: CartLine): number {
  return (cents(line.unitPrice) * line.quantity) / 100;
}

/** Provisional total for display only. */
export function cartTotal(cart: Cart): number {
  return cart.reduce((sum, line) => sum + cents(line.unitPrice) * line.quantity, 0) / 100;
}

export function cartQuantity(cart: Cart, productId: number): number {
  return cart.find((l) => l.productId === productId)?.quantity ?? 0;
}

export function addToCart(cart: Cart, product: Product, quantity: number): Cart {
  if (cart.some((l) => l.productId === product.id)) {
    return cart.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + quantity } : l));
  }
  return [...cart, { productId: product.id, sku: product.sku, name: product.name, unitPrice: product.unitPrice, quantity }];
}

export function setLineQuantity(cart: Cart, productId: number, quantity: number): Cart {
  return cart.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

export function removeFromCart(cart: Cart, productId: number): Cart {
  return cart.filter((l) => l.productId !== productId);
}

/** Updates the product snapshots from a fresh product list; unchanged carts are returned as-is. */
export function refreshCart(cart: Cart, products: Product[]): Cart {
  let changed = false;
  const next = cart.map((line) => {
    const p = products.find((product) => product.id === line.productId);
    if (!p || (p.sku === line.sku && p.name === line.name && p.unitPrice === line.unitPrice)) {
      return line;
    }
    changed = true;
    return { ...line, sku: p.sku, name: p.name, unitPrice: p.unitPrice };
  });
  return changed ? next : cart;
}

/** The whole cart as one reservation request, in a stable order so identical carts serialize identically. */
export function reservationRequest(cart: Cart): CreateReservationRequest {
  return {
    items: [...cart]
      .sort((a, b) => a.productId - b.productId)
      .map((l) => ({ productId: l.productId, quantity: l.quantity })),
  };
}

/** Accepts only well-formed lines from storage, which the user (or an older app version) may have altered. */
export function parseCart(value: unknown): Cart {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (l): l is CartLine =>
      typeof l === 'object' &&
      l !== null &&
      Number.isInteger(l.productId) &&
      Number.isInteger(l.quantity) &&
      l.quantity > 0 &&
      typeof l.sku === 'string' &&
      typeof l.name === 'string' &&
      typeof l.unitPrice === 'number'
  );
}
