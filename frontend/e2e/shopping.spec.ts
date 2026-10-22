import { expect, test, type Page } from '@playwright/test';

import { API_URL, createProduct, stock, uniqueSku } from './api';

// Earlier stack screens stay in the DOM on web, so lookups are limited to visible elements.
const visibleLabel = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });
const visibleButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true });

async function addToCart(page: Page, sku: string, quantity: number) {
  await visibleLabel(page, 'Search products').fill(sku);
  await visibleLabel(page, `Quantity of ${sku}`).fill(String(quantity));
  await visibleButton(page, `Add ${sku} to cart`).click();
  await expect(page.getByTestId('banner-success').filter({ visible: true })).toContainText(`Added ${quantity} ×`);
}

async function openCart(page: Page) {
  await page.getByRole('link', { name: 'Cart', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
}

test('shops several products, edits the cart, checks out and confirms the simulated payment', async ({ page, request }) => {
  const lampSku = uniqueSku('SHOP');
  const bulbSku = uniqueSku('SHOP');
  const vaseSku = uniqueSku('SHOP');
  const lamp = await createProduct(request, { sku: lampSku, price: '12.50', stock: 5 });
  const bulb = await createProduct(request, { sku: bulbSku, price: '3.00', stock: 10 });
  await createProduct(request, { sku: vaseSku, price: '8.00', stock: 4 });

  await page.goto('/shop');
  await addToCart(page, lampSku, 2);
  await addToCart(page, bulbSku, 3);
  await addToCart(page, vaseSku, 1);
  await expect(page.getByTestId('cart-count')).toHaveText('6');

  await openCart(page);
  // The second click of a double-click must neither dismiss the confirmation nor confirm it.
  const clearConfirm = page.getByRole('alert', { name: 'Clear the cart?' });
  await visibleButton(page, 'Clear cart').dblclick();
  await page.waitForTimeout(800);
  await expect(clearConfirm).toBeVisible();
  await clearConfirm.getByRole('button', { name: 'Keep' }).click();
  await expect(clearConfirm).toHaveCount(0);
  await expect(page.getByTestId(`cart-line-${vaseSku}`)).toBeVisible();
  await visibleButton(page, `Increase ${lampSku}`).click();
  await visibleButton(page, `Remove ${vaseSku}`).click();
  await visibleLabel(page, `Quantity of ${bulbSku}`).fill('4');
  await expect(page.getByTestId(`cart-line-${vaseSku}`)).toHaveCount(0);
  await expect(page.getByTestId(`cart-line-${lampSku}`)).toContainText('37.50');
  await expect(page.getByText('Estimated total 49.50')).toBeVisible();
  // The cart does not reserve anything.
  expect(await stock(request, lamp)).toEqual({ onHand: 5, reserved: 0, available: 5 });

  await visibleButton(page, 'Check out').click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  const reservationId = page.url().match(/\/checkout\/(\d+)/)![1];
  await expect(page.getByText(/Payment is simulated/)).toBeVisible();
  await expect(page.getByText('Total 49.50', { exact: true })).toBeVisible();
  await expect(page.getByTestId('checkout-expiry')).toContainText(/expires in \d+ min/);
  expect(await stock(request, lamp)).toEqual({ onHand: 5, reserved: 3, available: 2 });
  expect(await stock(request, bulb)).toEqual({ onHand: 10, reserved: 4, available: 6 });

  // A refresh keeps the checkout and does not reserve again.
  await page.reload();
  await expect(page.getByText(`Checkout · reservation #${reservationId}`)).toBeVisible();
  expect(await stock(request, lamp)).toEqual({ onHand: 5, reserved: 3, available: 2 });

  await visibleButton(page, 'Confirm payment').click();
  await expect(page).toHaveURL(/\/orders\/\d+\?confirmed=1$/);
  await expect(page.getByText(/Payment confirmed: order #\d+ was created/)).toBeVisible();
  await expect(page.getByTestId('order-summary')).toContainText(`SIM-${reservationId}`);
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
  // Confirmation keeps the units reserved, now for the order.
  expect(await stock(request, lamp)).toEqual({ onHand: 5, reserved: 3, available: 2 });

  // Repeating the confirmation returns the same order rather than creating another one.
  const replay = await request.post(`${API_URL}/api/reservations/${reservationId}/confirm`, {
    data: { paymentReference: `SIM-${reservationId}` },
  });
  expect(replay.ok()).toBeTruthy();
  const orderId = ((await replay.json()) as { id: number }).id;
  expect(page.url()).toContain(`/orders/${orderId}?`);

  // Reopening the paid checkout (e.g. after a lost response) finds the order through the reservation.
  await page.goto(`/checkout/${reservationId}`);
  await visibleButton(page, 'View order').click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.getByTestId('order-summary')).toContainText(`SIM-${reservationId}`);
});

test('reports insufficient stock, lets the customer revise the cart, and cancels the checkout', async ({ page, request }) => {
  const sku = uniqueSku('SHORT');
  const productId = await createProduct(request, { sku, price: '5.00', stock: 3 });

  await page.goto('/shop');
  await addToCart(page, sku, 3);

  // Another customer reserves part of the stock while the product sits in this cart.
  const competing = await request.post(`${API_URL}/api/reservations`, { data: { items: [{ productId, quantity: 2 }] } });
  expect(competing.ok()).toBeTruthy();

  await openCart(page);
  await visibleButton(page, 'Check out').click();
  await expect(page.getByTestId('banner-error').filter({ visible: true })).toContainText(
    /Insufficient stock .* available 1\. Nothing was reserved/
  );
  await expect(page.getByTestId(`cart-line-${sku}`)).toContainText('Only 1 available');
  expect(await stock(request, productId)).toEqual({ onHand: 3, reserved: 2, available: 1 });

  await visibleLabel(page, `Quantity of ${sku}`).fill('1');
  await visibleButton(page, 'Check out').click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  expect(await stock(request, productId)).toEqual({ onHand: 3, reserved: 3, available: 0 });

  await visibleButton(page, 'Cancel checkout').click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();

  // The cart is kept, unlocked, for another attempt.
  await expect(page).toHaveURL(/\/cart\?closed=cancelled&reservation=\d+$/);
  expect(await stock(request, productId)).toEqual({ onHand: 3, reserved: 2, available: 1 });
  await expect(page.getByTestId('banner-success').filter({ visible: true })).toContainText(/Checkout cancelled: reservation #\d+ was released/);
  await expect(page.getByTestId(`cart-line-${sku}`).filter({ visible: true })).toBeVisible();
  await expect(visibleLabel(page, `Quantity of ${sku}`)).toHaveValue('1');
  await expect(visibleButton(page, 'Check out')).toBeEnabled();
});

function navLink(page: Page, name: string) {
  return page.getByRole('link', { name, exact: true }).filter({ visible: true });
}

async function startCheckout(page: Page, sku: string, quantity: number) {
  await page.goto('/shop');
  await addToCart(page, sku, quantity);
  await openCart(page);
  await visibleButton(page, 'Check out').click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  return Number(page.url().match(/\/checkout\/(\d+)/)![1]);
}

test('locks the cart during checkout, wherever the customer navigates', async ({ page, request }) => {
  const sku = uniqueSku('LOCK');
  const productId = await createProduct(request, { sku, price: '4.00', stock: 5 });
  const reservationId = await startCheckout(page, sku, 2);
  const checkoutUrl = new RegExp(`/checkout/${reservationId}$`);
  await expect(page.getByRole('link', { name: /Back to cart/ }).filter({ visible: true })).toHaveCount(0);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  // Customer → Cart opens the active checkout.
  await navLink(page, 'Cart').click();
  await expect(page).toHaveURL(checkoutUrl);

  // The shop cannot add to the locked cart.
  await navLink(page, 'Shop').click();
  await expect(page.getByTestId('shop-locked').filter({ visible: true })).toBeVisible();
  await expect(visibleButton(page, `Add ${sku} to cart`)).toHaveCount(0);

  // Customer → Administration → Customer → Cart still opens the checkout.
  await navLink(page, 'Administration').click();
  await expect(page).toHaveURL(/\/admin\/inventory$/);
  await navLink(page, 'Customer').click();
  await expect(page).toHaveURL(/\/shop$/);
  await navLink(page, 'Cart').click();
  await expect(page).toHaveURL(checkoutUrl);

  // Loading or refreshing the cart URL opens the checkout as well.
  await page.goto('/cart');
  await expect(page).toHaveURL(checkoutUrl);
  await page.reload();
  await expect(page).toHaveURL(checkoutUrl);
  await expect(page.getByText(`Checkout · reservation #${reservationId}`).filter({ visible: true })).toBeVisible();

  // None of this reserved anything again.
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  await visibleButton(page, 'Cancel checkout').click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page).toHaveURL(/\/cart\?closed=cancelled/);
  await visibleButton(page, `Increase ${sku}`).click();
  await expect(visibleLabel(page, `Quantity of ${sku}`)).toHaveValue('3');
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 0, available: 5 });
});

test('keeps one history entry and one screen per checkout, and clears a changed cart on payment', async ({ page, request }) => {
  const sku = uniqueSku('HIST');
  const productId = await createProduct(request, { sku, price: '3.00', stock: 5 });
  const reservationId = await startCheckout(page, sku, 2);
  const checkoutUrl = new RegExp(`/checkout/${reservationId}$`);
  // Counts hidden stack screens too, so a second copy of the checkout would show up here.
  const checkoutScreens = page.getByText(`Checkout · reservation #${reservationId}`, { exact: true });
  const historyLength = () => page.evaluate(() => window.history.length);
  await expect(checkoutScreens).toHaveCount(1);
  const entries = await historyLength();

  // Repeated Cart selections stay on the one checkout without adding history.
  for (let i = 0; i < 3; i++) {
    await navLink(page, 'Cart').click();
    await expect(page).toHaveURL(checkoutUrl);
  }
  expect(await historyLength()).toBe(entries);
  await expect(checkoutScreens).toHaveCount(1);

  // Shop → Cart, then Back and Forward.
  await navLink(page, 'Shop').click();
  await expect(page).toHaveURL(/\/shop$/);
  await navLink(page, 'Cart').click();
  await expect(page).toHaveURL(checkoutUrl);
  await expect(checkoutScreens).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop$/);
  await page.goForward();
  await expect(page).toHaveURL(checkoutUrl);
  await expect(checkoutScreens.filter({ visible: true })).toBeVisible();
  await expect(checkoutScreens).toHaveCount(1);

  // Customer → Administration → Customer → Cart.
  await navLink(page, 'Administration').click();
  await expect(page).toHaveURL(/\/admin\/inventory$/);
  await navLink(page, 'Customer').click();
  await expect(page).toHaveURL(/\/shop$/);
  await navLink(page, 'Cart').click();
  await expect(page).toHaveURL(checkoutUrl);
  await expect(checkoutScreens).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop$/);
  await page.goForward();
  await expect(page).toHaveURL(checkoutUrl);

  // The stored cart is changed behind the app's back, then the page is refreshed.
  await page.evaluate(() =>
    window.localStorage.setItem(
      'inventory-orders.cart',
      JSON.stringify([{ productId: 999999, sku: 'TAMPERED', name: 'Tampered', unitPrice: 1, quantity: 9 }])
    )
  );
  await page.reload();
  await expect(page).toHaveURL(checkoutUrl);
  await expect(checkoutScreens).toHaveCount(1);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  await visibleButton(page, 'Confirm payment').click();
  await expect(page).toHaveURL(/\/orders\/\d+\?confirmed=1$/);
  const orderId = Number(page.url().match(/\/orders\/(\d+)/)![1]);
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('inventory-orders.cart'))).toBe('[]');
  expect(await page.evaluate(() => window.localStorage.getItem('inventory-orders.checkout'))).toBeNull();

  // Back leaves the order without paying again; the paid checkout only links to its order.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/orders\//);
  await page.goto(`/checkout/${reservationId}`);
  await expect(visibleButton(page, 'View order')).toBeVisible();
  await expect(visibleButton(page, 'Confirm payment')).toHaveCount(0);
  const replay = await request.post(`${API_URL}/api/reservations/${reservationId}/confirm`, {
    data: { paymentReference: `SIM-${reservationId}` },
  });
  expect(((await replay.json()) as { id: number }).id).toBe(orderId);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });
});

test('returns to the editable cart when the backend reports the reservation expired', async ({ page, request }) => {
  const sku = uniqueSku('EXP');
  const productId = await createProduct(request, { sku, price: '6.00', stock: 5 });
  const reservationId = await startCheckout(page, sku, 2);

  // Waiting out the real reservation TTL is too slow for a test: report the reservation as expired instead.
  await page.route(`**/api/reservations/${reservationId}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), status: 'EXPIRED' } });
  });
  await page.reload();

  await expect(page).toHaveURL(new RegExp(`/cart\\?closed=expired&reservation=${reservationId}$`));
  await expect(page.getByTestId('banner-error').filter({ visible: true })).toContainText(
    `Reservation #${reservationId} expired before payment was confirmed`
  );
  await expect(visibleLabel(page, `Quantity of ${sku}`)).toHaveValue('2');
  await page.unroute(`**/api/reservations/${reservationId}`);

  // Checking out again makes a new reservation.
  await visibleButton(page, 'Check out').click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  const next = Number(page.url().match(/\/checkout\/(\d+)/)![1]);
  expect(next).not.toBe(reservationId);
  // The expiry was simulated, so the first reservation still holds its stock until it is released.
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 4, available: 1 });
  expect((await request.post(`${API_URL}/api/reservations/${reservationId}/cancel`)).ok()).toBeTruthy();
});

test('recovers safely when the checkout and payment responses are lost', async ({ page, request }) => {
  const sku = uniqueSku('LOST');
  const productId = await createProduct(request, { sku, price: '2.00', stock: 5 });
  await page.goto('/shop');
  await addToCart(page, sku, 2);
  await openCart(page);

  // The reservation is created, but its response never reaches the browser.
  let reservationId = 0;
  await page.route('**/api/reservations', async (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    reservationId = ((await (await route.fetch()).json()) as { id: number }).id;
    await route.abort('failed');
  });
  await visibleButton(page, 'Check out').click();
  await expect(page.getByTestId('banner-error').filter({ visible: true })).toContainText('Your cart may already be reserved');
  await expect(page.getByTestId('checkout-unconfirmed').filter({ visible: true })).toBeVisible();
  await expect(visibleButton(page, 'Check out')).toHaveCount(0);
  await expect(visibleButton(page, `Remove ${sku}`)).toHaveCount(0);
  expect(reservationId).toBeGreaterThan(0);
  await page.unroute('**/api/reservations');

  // The lock survives a reload; retrying resumes the same reservation instead of reserving twice.
  await page.reload();
  await visibleButton(page, 'Retry checkout').click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${reservationId}$`));
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });

  // The payment goes through, but its response is lost too: the checkout asks the backend and opens the order.
  let orderId = 0;
  await page.route(`**/api/reservations/${reservationId}/confirm`, async (route) => {
    orderId = ((await (await route.fetch()).json()) as { id: number }).id;
    await route.abort('failed');
  });
  await visibleButton(page, 'Confirm payment').click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  expect(page.url()).toMatch(new RegExp(`/orders/${orderId}$`));
  await expect(page.getByTestId('cart-count')).toHaveCount(0);

  // Exactly one order exists for the reservation.
  const replay = await request.post(`${API_URL}/api/reservations/${reservationId}/confirm`, {
    data: { paymentReference: `SIM-${reservationId}` },
  });
  expect(((await replay.json()) as { id: number }).id).toBe(orderId);
  expect(await stock(request, productId)).toEqual({ onHand: 5, reserved: 2, available: 3 });
});
