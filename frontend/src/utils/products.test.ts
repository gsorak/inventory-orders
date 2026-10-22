import { product } from '../test-utils/fixtures';
import { levelOf, matchesSearch, productLabel, stockLevel } from './products';

describe('stock levels', () => {
  it('follows the low-stock report rule: available at or below the threshold', () => {
    expect(levelOf(0, 5)).toBe('OUT_OF_STOCK');
    expect(levelOf(5, 5)).toBe('LOW_STOCK');
    expect(levelOf(6, 5)).toBe('IN_STOCK');
    expect(levelOf(0, 0)).toBe('OUT_OF_STOCK');
    expect(stockLevel(product({ lowStockThreshold: 2, stock: { onHand: 9, reserved: 7, available: 2 } }))).toBe('LOW_STOCK');
  });
});

describe('matchesSearch', () => {
  it('matches products by name or SKU, ignoring case and surrounding spaces', () => {
    const lamp = product();
    expect(matchesSearch(lamp, '')).toBe(true);
    expect(matchesSearch(lamp, ' desk ')).toBe(true);
    expect(matchesSearch(lamp, 'lamp-0')).toBe(true);
    expect(matchesSearch(lamp, 'cable')).toBe(false);
  });
});

describe('productLabel', () => {
  it('names known products and falls back to the id', () => {
    const lamp = product();
    expect(productLabel([lamp], lamp.id)).toBe(`${lamp.name} (${lamp.sku})`);
    expect(productLabel([lamp], 999)).toBe('Product #999');
  });
});
