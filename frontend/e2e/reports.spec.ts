import { expect, test } from '@playwright/test';

import { createProduct, deliver, placeOrder, uniqueSku } from './api';
import { openSection } from './navigation';

test('shows low stock, cycle time and aging reports from the backend', async ({ page, request }) => {
  const lowSku = uniqueSku('LOW');
  await createProduct(request, { sku: lowSku, stock: 3, threshold: 5 });
  const deliveredSku = uniqueSku('CYC');
  const productId = await createProduct(request, { sku: deliveredSku, stock: 2 });
  const order = await placeOrder(request, productId, 1);
  await deliver(request, order.id, order.items[0].id, 1);

  await openSection(page, 'Reports');

  const lowStock = page.getByTestId(`low-stock-${lowSku}`);
  await expect(lowStock).toBeVisible();
  await expect(lowStock).toContainText(`E2E ${lowSku}`);
  await expect(page.getByTestId(`low-stock-${deliveredSku}`)).toHaveCount(0);

  const cycleTime = page.getByTestId('cycle-time-report');
  await expect(cycleTime.getByText(/Delivered orders: [1-9]\d*/)).toBeVisible();
  await cycleTime.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(cycleTime.getByText(/Delivered orders: [1-9]\d*/)).toBeVisible();

  await expect(page.getByTestId('aging-report')).toContainText(deliveredSku);
});
