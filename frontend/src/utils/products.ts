import type { Product } from '../api/types';

/** "Desk lamp (LAMP-001)" for a product id, falling back to "Product #id" when the product is unknown. */
export function productLabel(products: Product[], productId: number): string {
  const product = products.find((p) => p.id === productId);
  return product ? `${product.name} (${product.sku})` : `Product #${productId}`;
}

export type StockLevel = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

/** Same rule as the backend's low-stock report: available at or below the threshold. */
export function stockLevel(product: Product): StockLevel {
  return levelOf(product.stock.available, product.lowStockThreshold);
}

export function levelOf(available: number, lowStockThreshold: number): StockLevel {
  if (available === 0) {
    return 'OUT_OF_STOCK';
  }
  return available <= lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK';
}

export function matchesSearch(product: Product, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return needle === '' || product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle);
}
