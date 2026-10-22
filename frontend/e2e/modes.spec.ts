import { expect, test, type Page } from '@playwright/test';

function navLink(page: Page, name: string) {
  // Earlier stack screens (and their headers) stay in the DOM on web.
  return page.getByRole('link', { name, exact: true }).filter({ visible: true });
}

test('switches between the Customer and Administration navigation', async ({ page }) => {
  await page.goto('/guide');
  // The guide is shared; it shows the Administration sections until a mode is chosen.
  await expect(navLink(page, 'Orders & Fulfilment')).toBeVisible();
  await expect(navLink(page, 'Cart')).toHaveCount(0);

  await navLink(page, 'Customer').click();
  await expect(page).toHaveURL(/\/shop$/);
  for (const name of ['Shop', 'Cart', 'Orders']) {
    await expect(navLink(page, name)).toBeVisible();
  }
  await expect(navLink(page, 'Inventory')).toHaveCount(0);

  await navLink(page, 'Cart').click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText('Your cart is empty.')).toBeVisible();

  await navLink(page, 'Orders').click();
  await expect(page).toHaveURL(/\/orders$/);

  // The guide keeps the last mode's navigation.
  await navLink(page, 'Demo guide').click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(navLink(page, 'Cart')).toBeVisible();

  await navLink(page, 'Administration').click();
  await expect(page).toHaveURL(/\/admin\/inventory$/);
  for (const name of ['Inventory', 'Reservations', 'Orders & Fulfilment', 'Reports']) {
    await expect(navLink(page, name)).toBeVisible();
  }
  await expect(navLink(page, 'Cart')).toHaveCount(0);
});

test('fits the navigation on a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, names] of [
    ['/shop', ['Customer', 'Administration', 'Demo guide', 'Shop', 'Cart', 'Orders']],
    ['/admin/inventory', ['Customer', 'Administration', 'Demo guide', 'Inventory', 'Reservations', 'Orders & Fulfilment', 'Reports']],
  ] as const) {
    await page.goto(path);
    for (const name of names) {
      const box = await navLink(page, name).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(390);
    }
  }
});
