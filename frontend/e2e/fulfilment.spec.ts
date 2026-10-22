import { expect, test } from '@playwright/test';

import { createProduct, placeOrder, stock, uniqueSku } from './api';
import { openOrder } from './navigation';

test('partial fulfilment through the next actions: pack, ship, deliver, then the rest', async ({ page, request }) => {
  const sku = uniqueSku('FUL');
  const productId = await createProduct(request, { sku, price: '20.00', stock: 10 });
  const order = await placeOrder(request, productId, 3);
  const itemId = order.items[0].id;
  const packLabel = `Units to pack of E2E ${sku} (${sku})`;
  expect(await stock(request, productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });

  await openOrder(page, order.id);
  const summary = page.getByTestId('order-summary');
  const actions = page.getByTestId('next-actions');
  const dialog = page.getByTestId('dialog');
  const itemRow = page.getByTestId(`order-item-${itemId}`);
  await expect(summary.getByLabel('Status CONFIRMED')).toBeVisible();
  await expect(summary).toContainText('Order: Confirmed');
  await expect(actions).toContainText('Pack a shipment');
  // The pack form is only shown in its dialog.
  await expect(page.getByLabel(/Units to pack/)).toHaveCount(0);

  // First, partial shipment: 2 of 3 units.
  await actions.getByRole('button', { name: 'Pack shipment…' }).click();
  await expect(dialog).toContainText(`E2E ${sku} (${sku})`);
  await expect(dialog).toContainText('3 of 3 not packed yet');
  await expect(dialog).not.toContainText(`item ${itemId}`);
  const select = dialog.getByLabel(packLabel);
  await expect(select).toHaveValue('3');
  await expect(select.locator('option')).toHaveText(['0', '1', '2', '3']);
  await select.selectOption('0');
  await expect(dialog.getByRole('button', { name: 'Pack shipment', exact: true })).toBeDisabled();
  await select.selectOption('2');
  await dialog.getByRole('button', { name: 'Pack shipment', exact: true }).click();
  await expect(page.getByText(/Shipment #\d+ packed\. Ship it next\./)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(summary.getByLabel('Status IN_FULFILMENT')).toBeVisible();
  await expect(itemRow.getByLabel('Packed 2')).toBeVisible();
  const firstShipment = page.locator('[data-testid^="shipment-"]');
  await expect(firstShipment).toHaveCount(1);
  await expect(firstShipment).toContainText('Shipment: Packed');

  await actions.getByRole('button', { name: /^Ship shipment/ }).click();
  await expect(page.getByText(/shipped\. Its units left on-hand and reserved stock/)).toBeVisible();
  await expect(firstShipment).toContainText('Shipment: Shipped');
  expect(await stock(request, productId)).toEqual({ onHand: 8, reserved: 1, available: 7 });

  await actions.getByRole('button', { name: /^Deliver shipment/ }).click();
  await expect(itemRow.getByLabel('Delivered 2')).toBeVisible();
  await expect(firstShipment).toContainText('Shipment: Delivered');
  await expect(actions).toContainText('Pack the remaining units in another shipment.');
  // Delivered units are returnable while the rest is still unpacked.
  await expect(actions.getByRole('button', { name: 'Record return…' })).toBeVisible();

  // Second shipment with the remaining unit completes the order; checked on a phone-sized screen.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await actions.getByRole('button', { name: 'Pack shipment…' }).click();
  await expect(dialog).toContainText('1 of 3 not packed yet');
  await expect(select).toHaveValue('1');
  await expect(select.locator('option')).toHaveText(['0', '1']);
  await expect(select).toBeInViewport();
  await dialog.getByRole('button', { name: 'Pack shipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize(desktop);
  await actions.getByRole('button', { name: /^Ship shipment/ }).click();
  await expect(actions.getByRole('button', { name: /^Deliver shipment/ })).toBeVisible();
  await actions.getByRole('button', { name: /^Deliver shipment/ }).click();
  await expect(summary.getByLabel('Status DELIVERED')).toBeVisible();
  await expect(itemRow.getByLabel('Delivered 3')).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Pack shipment…' })).toHaveCount(0);
  await expect(page.locator('[data-testid^="shipment-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="shipment-"]').getByLabel('Status DELIVERED')).toHaveCount(2);
  expect(await stock(request, productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });

  await page.getByRole('link', { name: '← Orders' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByTestId(`order-${order.id}`).getByLabel('Status DELIVERED')).toBeVisible();
});
