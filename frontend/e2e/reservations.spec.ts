import { expect, test } from '@playwright/test';

import { createProduct, placeOrder, reserve, stock, uniqueSku } from './api';
import { openSection } from './navigation';

test('inspects an active reservation and cancels it after confirmation', async ({ page, request }) => {
  const sku = uniqueSku('RSV');
  const productId = await createProduct(request, { sku, price: '10.00', stock: 5 });
  // Reservations are created by the customer checkout; here the API stands in for it.
  const reservationId = await reserve(request, productId, 2);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  await openSection(page, 'Reservations');
  await expect(page.getByRole('button', { name: /Reserve|Confirm payment/ })).toHaveCount(0);
  const row = page.getByTestId(`reservation-${reservationId}`);
  await expect(row.getByLabel('Status ACTIVE')).toBeVisible();
  await expect(row).toContainText(`2 × E2E ${sku}`);
  await expect(row).toContainText(/Expires in \d+ min/);
  await expect(row.getByLabel('Stock Held', { exact: true })).toBeVisible();

  await row.getByRole('link', { name: `Open reservation ${reservationId}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservationId}$`));
  const summary = page.getByTestId('reservation-summary');
  await expect(summary).toContainText(`Reservation #${reservationId}`);
  await expect(summary).toContainText('Reservation: Active');
  await expect(page.getByTestId('stock-hold')).toContainText('Stock: Held');
  await expect(page.getByTestId('stock-hold')).toContainText('Released automatically if the payment is not confirmed');
  await expect(page.getByTestId(`reservation-item-${productId}`).getByLabel('Quantity 2')).toBeVisible();
  await expect(page.getByText('2 units · Total 20.00')).toBeVisible();

  const cancel = summary.getByRole('button', { name: 'Cancel reservation' });
  const confirm = page.getByRole('alert', { name: `Cancel reservation #${reservationId}?` });
  // A double-click opens the confirmation without the second click dismissing or confirming it.
  await cancel.dblclick();
  await page.waitForTimeout(800);
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(summary).toContainText('Reservation: Active');
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  await cancel.click();
  await confirm.getByRole('button', { name: 'Cancel reservation' }).click();
  await expect(page.getByText(`Reservation #${reservationId} cancelled; its stock is available again.`)).toBeVisible();
  await expect(summary).toContainText('Reservation: Cancelled');
  await expect(page.getByTestId('stock-hold')).toContainText('Stock: Released');
  await expect(page.getByTestId('stock-hold')).toContainText('Cancelled; the stock was released');
  await expect(cancel).toHaveCount(0);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 0, available: 5 });

  await page.getByRole('link', { name: '← Reservations' }).click();
  await expect(page).toHaveURL(/\/admin\/reservations$/);
  await expect(row.getByLabel('Status CANCELLED')).toBeVisible();
  await expect(row.getByLabel('Stock Released', { exact: true })).toBeVisible();
});

test('links a confirmed reservation to its order', async ({ page, request }) => {
  const productId = await createProduct(request, { sku: uniqueSku('RSO'), stock: 2 });
  const order = await placeOrder(request, productId, 1);

  await page.goto(`/admin/reservations/${order.reservationId}`);
  const summary = page.getByTestId('reservation-summary');
  await expect(summary).toContainText('Reservation: Confirmed');
  await expect(page.getByTestId('stock-hold')).toContainText('Stock: Held by order');
  await expect(summary.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0);

  await page.getByRole('link', { name: `Open order #${order.id} →` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}$`));
  await expect(page.getByTestId('order-summary')).toContainText(`Order #${order.id}`);
});
