import { expect, test } from '@playwright/test';

import { createProduct, placeOrder, uniqueSku } from './api';

test('opens and reloads deep links of the production web build', async ({ page, request }) => {
  const productId = await createProduct(request, { sku: uniqueSku('LNK'), stock: 1 });
  const order = await placeOrder(request, productId, 1);

  const summary = page.getByTestId('order-summary');

  await page.goto(`/admin/orders/${order.id}`);
  await expect(summary).toContainText(`Order #${order.id}`);
  await expect(summary.getByLabel('Status CONFIRMED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pack shipment…' })).toBeVisible();
  await page.reload();
  await expect(summary).toContainText(`Order #${order.id}`);

  await page.goto(`/admin/reservations/${order.reservationId}`);
  await page.reload();
  await expect(page.getByTestId('reservation-summary')).toContainText(`Reservation #${order.reservationId}`);

  // The customer view of the same order is read-only.
  await page.goto(`/orders/${order.id}`);
  await expect(summary).toContainText(`Order #${order.id}`);
  await page.reload();
  await expect(summary.getByLabel('Status CONFIRMED')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pack shipment|Record return/ })).toHaveCount(0);

  for (const [path, label] of [
    ['/shop', 'Shop'],
    ['/cart', 'Cart'],
    ['/admin/reports', 'Reports'],
    ['/guide', 'Demo guide'],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
});

test('redirects the start page and earlier URLs', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/guide$/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/inventory$/);

  await page.goto('/reservations');
  await expect(page).toHaveURL(/\/admin\/reservations$/);
  await expect(page.getByText(/Customers create reservations at checkout/)).toBeVisible();

  await page.goto('/reports');
  await expect(page).toHaveURL(/\/admin\/reports$/);
});

test('serves routes as the app shell but keeps missing assets 404', async ({ request }) => {
  const route = await request.get('/orders/123456');
  expect(route.status()).toBe(200);
  expect(route.headers()['content-type']).toContain('text/html');

  expect((await request.get('/_expo/static/js/web/missing.js')).status()).toBe(404);
});
