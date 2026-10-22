import { expect, test } from '@playwright/test';

import { createProduct, deliver, placeOrder, stock, uniqueSku } from './api';
import { openOrder } from './navigation';

test('returns delivered units and issues a credit note', async ({ page, request }) => {
  const sku = uniqueSku('RET');
  const productId = await createProduct(request, { sku, price: '15.00', stock: 5 });
  const order = await placeOrder(request, productId, 3);
  const itemId = order.items[0].id;

  await openOrder(page, order.id);
  const actions = page.getByTestId('next-actions');
  const dialog = page.getByTestId('dialog');
  await expect(actions.getByRole('button', { name: 'Record return…' })).toHaveCount(0);

  await deliver(request, order.id, itemId, 3);
  await page.getByTestId('order-summary').getByRole('button', { name: 'Refresh' }).click();
  await expect(actions).toContainText(/Return delivered units to issue a credit note/);

  // One unopened unit is restocked, one defective opened unit is discarded.
  const product = `E2E ${sku} (${sku})`;
  const select = dialog.getByLabel(`Quantity to return of ${product}`);
  const recordButton = dialog.getByRole('button', { name: 'Record return', exact: true });
  // The second click of a double-click lands on the backdrop (the button is outside the card) and must not close it.
  await actions.getByRole('button', { name: 'Record return…' }).dblclick();
  await expect(dialog).toContainText(product);
  await expect(dialog).toContainText('3 of 3 delivered units can be returned');
  await expect(dialog).not.toContainText(`item ${itemId}`);
  await expect(select).toHaveValue('0');
  await expect(select.locator('option')).toHaveText(['0', '1', '2', '3']);
  await expect(recordButton).toBeDisabled();
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await select.selectOption('1');
  await expect(dialog.getByRole('radio', { name: `Reason for ${product}: No longer needed` })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: `Condition of ${product}: Unopened` })).toBeChecked();
  await recordButton.click();
  await expect(page.getByText(/restocked\. Credit note CN-\d+ issued for 15\.00/)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await stock(request, productId)).toEqual({ onHand: 3, reserved: 0, available: 3 });

  // The second return is recorded on a phone-sized screen.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await actions.getByRole('button', { name: 'Record return…' }).click();
  await expect(dialog).toContainText('2 of 3 delivered units can be returned');
  await expect(select).toHaveValue('0');
  await expect(select.locator('option')).toHaveText(['0', '1', '2']);
  await select.selectOption('1');
  const defective = dialog.getByRole('radio', { name: `Reason for ${product}: Defective` });
  await defective.scrollIntoViewIfNeeded();
  await expect(defective).toBeInViewport();
  await defective.click();
  await dialog.getByRole('radio', { name: `Condition of ${product}: Opened` }).click();
  await recordButton.click();
  await expect(page.getByText(/discarded\. Credit note CN-\d+ issued for 15\.00/)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize(desktop);
  expect(await stock(request, productId)).toEqual({ onHand: 3, reserved: 0, available: 3 });

  await expect(page.getByLabel('Credited 30.00')).toBeVisible();
  await expect(page.getByLabel('Net 15.00')).toBeVisible();
  const returns = page.locator('[data-testid^="return-"]');
  await expect(returns).toHaveCount(2);
  await expect(returns.filter({ hasText: /CN-\d+/ })).toHaveCount(2);
  await expect(page.getByLabel('Status RESTOCK')).toBeVisible();
  await expect(page.getByLabel('Status DISCARD')).toBeVisible();

  // Only the one remaining delivered unit can be chosen.
  await actions.getByRole('button', { name: 'Record return…' }).click();
  await expect(select.locator('option')).toHaveText(['0', '1']);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(returns).toHaveCount(2);
});
