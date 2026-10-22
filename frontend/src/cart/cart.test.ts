import { product } from '../test-utils/fixtures';
import {
  addToCart,
  cartQuantity,
  cartTotal,
  lineTotal,
  parseCart,
  refreshCart,
  removeFromCart,
  reservationRequest,
  setLineQuantity,
  type Cart,
} from './cart';

const lamp = product();
const bulb = product({ id: 2, sku: 'BULB-1', name: 'Bulb', unitPrice: 0.1 });

describe('cart', () => {
  it('adds multiple products and merges repeated additions of the same product', () => {
    let cart: Cart = [];
    cart = addToCart(cart, lamp, 2);
    cart = addToCart(cart, bulb, 3);
    cart = addToCart(cart, lamp, 1);

    expect(cart.map((l) => [l.sku, l.quantity])).toEqual([
      ['LAMP-001', 3],
      ['BULB-1', 3],
    ]);
    expect(cartQuantity(cart, 1)).toBe(3);
    expect(cartQuantity(cart, 99)).toBe(0);
  });

  it('updates quantities and removes products', () => {
    let cart = addToCart(addToCart([], lamp, 2), bulb, 3);
    cart = setLineQuantity(cart, 2, 7);
    expect(cartQuantity(cart, 2)).toBe(7);

    cart = removeFromCart(cart, 1);
    expect(cart.map((l) => l.sku)).toEqual(['BULB-1']);
  });

  it('computes line and cart totals in cents', () => {
    const cart = addToCart(addToCart([], lamp, 3), bulb, 3);
    expect(lineTotal(cart[0])).toBe(59.85);
    expect(lineTotal(cart[1])).toBe(0.3);
    expect(cartTotal(cart)).toBe(60.15);
    expect(cartTotal([])).toBe(0);
  });

  it('refreshes product snapshots and keeps the same cart when nothing changed', () => {
    const cart = addToCart([], lamp, 1);
    expect(refreshCart(cart, [lamp, bulb])).toBe(cart);

    const refreshed = refreshCart(cart, [{ ...lamp, unitPrice: 24.5, name: 'Lamp' }]);
    expect(refreshed[0]).toMatchObject({ name: 'Lamp', unitPrice: 24.5, quantity: 1 });
  });

  it('builds the reservation request in product id order', () => {
    const cart = addToCart(addToCart([], bulb, 3), lamp, 2);
    expect(reservationRequest(cart)).toEqual({
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 3 },
      ],
    });
  });

  it('ignores malformed stored data', () => {
    expect(parseCart('nonsense')).toEqual([]);
    const valid = { productId: 1, sku: 'LAMP-001', name: 'Desk lamp', unitPrice: 19.95, quantity: 2 };
    expect(parseCart([valid, { ...valid, quantity: 0 }, { productId: 'x' }, null])).toEqual([valid]);
  });
});
