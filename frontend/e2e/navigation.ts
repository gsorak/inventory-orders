import { expect, type Page } from '@playwright/test';

/** Navigates through the Administration nav bar and order list, as a user would (deep links are covered by deep-links.spec.ts). */
export async function openSection(
  page: Page,
  name: 'Inventory' | 'Reservations' | 'Orders & Fulfilment' | 'Reports'
) {
  await page.goto('/admin/inventory');
  await page.getByRole('link', { name, exact: true }).first().click();
}

export async function openOrder(page: Page, orderId: number) {
  await openSection(page, 'Orders & Fulfilment');
  await page.getByLabel(`Open order ${orderId}`, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderId}$`));
}
