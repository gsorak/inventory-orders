import { expect, test } from '@playwright/test';

import { API_URL, createProduct, stock, uniqueSku } from './api';

test('creates a product in a dialog, rejects invalid input and receives stock', async ({ page, request }) => {
  const sku = uniqueSku('INV');
  await page.goto('/admin/inventory');
  await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
  // The forms are only shown in dialogs.
  await expect(page.getByLabel('SKU', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByTestId('dialog');
  await dialog.getByLabel('SKU', { exact: true }).fill(sku);
  await dialog.getByLabel('Name', { exact: true }).fill('E2E lamp');
  // Keystrokes that would make the price malformed are ignored.
  await dialog.getByLabel('Unit price').pressSequentially('12.34.5a');
  await expect(dialog.getByLabel('Unit price')).toHaveValue('12.34');
  await dialog.getByLabel('Low-stock threshold').fill('');
  await dialog.getByLabel('Low-stock threshold').pressSequentially('2.x');
  await expect(dialog.getByLabel('Low-stock threshold')).toHaveValue('2');
  await dialog.getByLabel('Unit price').fill('0');
  await dialog.getByRole('button', { name: 'Create product' }).click();
  await expect(dialog.getByText('Must be at least 0.01')).toBeVisible();

  await dialog.getByLabel('Unit price').fill('12.50');
  await dialog.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByText(`Product ${sku} created. Receive stock to make it available.`)).toBeVisible();
  await expect(dialog).toHaveCount(0);

  const row = page.getByTestId(`product-${sku}`);
  await expect(row.getByLabel('On hand 0')).toBeVisible();
  await expect(row.getByLabel('Status OUT_OF_STOCK')).toBeVisible();

  await row.getByRole('button', { name: `Receive stock for ${sku}` }).click();
  await dialog.getByLabel('Quantity received').fill('0');
  await dialog.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(dialog.getByText('Must be between 1 and 1000000')).toBeVisible();
  await dialog.getByLabel('Quantity received').fill('25');
  await dialog.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(page.getByText(`Received 25 units of ${sku}. On hand is now 25, available 25.`)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByLabel('Available 25')).toBeVisible();
  await expect(row.getByLabel('Status IN_STOCK')).toBeVisible();

  // The same SKU cannot be created twice: the backend's message is shown in the dialog.
  await page.getByRole('button', { name: 'Add product' }).click();
  await dialog.getByLabel('SKU', { exact: true }).fill(sku);
  await dialog.getByLabel('Name', { exact: true }).fill('Duplicate');
  await dialog.getByLabel('Unit price').fill('1');
  await dialog.getByLabel('Low-stock threshold').fill('0');
  await dialog.getByRole('button', { name: 'Create product' }).click();
  await expect(dialog.getByTestId('banner-error')).toContainText(sku);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  // Receiving stock and the rejected duplicate left exactly one product for this SKU, with the received stock.
  const products = (await (await request.get(`${API_URL}/api/products`)).json()) as { id: number; sku: string }[];
  const matching = products.filter((p) => p.sku === sku);
  expect(matching).toHaveLength(1);
  expect(await stock(request, matching[0].id)).toEqual({ onHand: 25, reserved: 0, available: 25 });
});

test('searches products and flags low stock', async ({ page, request }) => {
  const prefix = uniqueSku('SRCH');
  await createProduct(request, { sku: `${prefix}-A`, stock: 2, threshold: 5 });
  await createProduct(request, { sku: `${prefix}-B`, stock: 20, threshold: 5 });

  await page.goto('/admin/inventory');
  await page.getByLabel('Search products').fill(prefix.toLowerCase());
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(2);
  await expect(page.getByTestId(`product-${prefix}-A`).getByLabel('Status LOW_STOCK')).toBeVisible();
  await expect(page.getByTestId(`product-${prefix}-B`).getByLabel('Status IN_STOCK')).toBeVisible();

  await page.getByLabel('Search products').fill(`${prefix}-B`);
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(1);
});
