# Inventory & Orders – web frontend

An Expo Router app (TypeScript, React Native for web) with two modes, switched in the top navigation bar:

- **Customer** — **Shop**, **Cart** with checkout and a simulated payment, and **Orders**, a read-only view of
  orders, shipments, returns and credit notes;
- **Administration** — **Inventory**, **Reservations**, **Orders & Fulfilment** (with an order details screen) and
  **Reports**.

A shared **Demo guide** page is reachable from both modes. The mode switch is for demonstration only: there is no
sign-in or access control, and every route can be opened directly. The app calls the
[backend](../backend/README.md) REST API
and has no business rules of its own: every stock level, status, expiry and total shown comes from the backend
(the cart's estimated total is the only value computed in the browser).
Overview of the whole project: [root README](../README.md).

| Route                                             | Page                                                  |
| ------------------------------------------------- | ----------------------------------------------------- |
| `/`                                               | redirects to `/guide`                                 |
| `/guide`                                          | Demo guide (keeps the navigation of the last mode)    |
| `/shop`, `/cart`                                  | Customer: product catalogue, cart                     |
| `/checkout/{id}`                                  | Customer: checkout of reservation `{id}`, payment     |
| `/orders`, `/orders/{id}`                         | Customer: order list and read-only order details      |
| `/admin`                                          | redirects to `/admin/inventory`                       |
| `/admin/inventory`                                | Administration: products, stock, add product, receive |
| `/admin/reservations`, `/admin/reservations/{id}` | Administration: reservation monitoring and details    |
| `/admin/orders`, `/admin/orders/{id}`             | Administration: order list, fulfilment and returns    |
| `/admin/reports`                                  | Administration: reports                               |
| `/reservations`, `/reports`                       | earlier URLs, redirect to their `/admin/...` pages    |

## Requirements

- **Node.js 20.19 or later** with npm (tested with Node 24). Check with `node -v`.
- Expo SDK 58 (installed by `npm install`; no global Expo CLI needed).
- A running backend for the app itself (the E2E tests start their own, see below): see the
  [backend quick start](../backend/README.md#1-quick-start) (JDK 21 and Docker).

## Install and start

Run these commands from `frontend/`, with the backend running (`../backend/start-dev.sh` in another terminal):

```bash
npm install
cp .env.example .env     # optional; only needed to change the backend URL
npm run web              # Expo web dev server on http://localhost:8081 (press w if the browser does not open)
```

## Backend connectivity and environment

| Variable / property                                     | Where                                               | Default                                         | Meaning                                                   |
| ------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                   | `frontend/.env` or the environment                  | see below                                       | Backend base URL, inlined at bundle time (restart Expo)   |
| `app.cors.allowed-origins` (`APP_CORS_ALLOWED_ORIGINS`) | `backend/src/main/resources/application.properties` | `http://localhost:8081`,`http://localhost:8082` | Browser origins allowed to call the API (comma-separated) |

`EXPO_PUBLIC_API_URL` is read in one place, `resolveApiBaseUrl` in `src/api/client.ts`, and every request goes
through that client. Expo inlines the value **when the bundle is built**: restart `npm run web` or re-export after
changing it. A shell value overrides `frontend/.env`.

| Environment                                            | `EXPO_PUBLIC_API_URL`          | Requests go to                                                             |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| Local development (backend allows the origin via CORS) | `http://localhost:8080`        | `http://localhost:8080/api/...`                                            |
| Same origin, e.g. CloudFront with `/api/*` → backend   | empty (`EXPO_PUBLIC_API_URL=`) | relative `/api/...` (no domain baked in)                                   |
| Not set                                                | —                              | dev server: `http://localhost:8080`; production build: relative `/api/...` |

If the frontend runs on another port or host, add that origin to `app.cors.allowed-origins`, e.g.
`APP_CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:8082,http://localhost:19006 ../backend/start-dev.sh`
(8081 is the dev server, 8082 the production build used by the E2E tests).

## Demo the workflows

The start page is the **Demo guide**: a suggested run plus the customer and administration workflows, each step
linking to its screen. The screens show hints with the next possible action, changed values are highlighted after
each operation, and administration forms open in dialogs. Below 960 px window width the tables (inventory,
reservations, orders, order lines, reports) turn into one card per row with a label on every value. A suggested run
with a fresh product:

### 1. Administration – prepare stock

**Inventory** – search by name or SKU; each product shows price, on hand, reserved, available and a stock level
(in stock / low stock / out of stock). **Add product** (e.g. SKU `DEMO-1`, price `20`, threshold `5`), then
**Receive stock** on its row for 10 units: on hand and available become 10.

### 2. Customer – Shop → Cart → Checkout → Payment confirmation → Orders

1. **Shop** – search by name or SKU, choose a quantity and **Add to cart** (3 × `DEMO-1`). Out-of-stock products
   are marked and cannot be added; you cannot add more than is currently available.
2. **Cart** – change quantities, remove products or clear the cart; it shows unit prices, line totals and an
   estimated total. The cart is kept in the browser (`localStorage`) and **does not reserve stock**.
3. **Check out** – refreshes availability and reserves the whole cart in one `POST /api/reservations`
   (Inventory now shows reserved 3, available 7). If another customer took the stock meanwhile, the backend's
   `INSUFFICIENT_STOCK` message is shown, nothing is reserved and the short lines are highlighted for you to adjust.
4. **Checkout page** – shows the reserved products, the backend total and a live expiry countdown, and offers only
   **Confirm payment** and **Cancel checkout**. While the reservation is active the cart is locked: **Cart** (also
   after switching to Administration and back, or after a reload) opens this page, and the shop cannot add products.
   **Confirm payment** is simulated (reference `SIM-{reservation id}`, no money involved), empties the cart and opens
   the new order; **Cancel checkout** releases the stock and returns to the unchanged, editable cart. When the
   backend reports the reservation expired, the cart is unlocked with an explanation; the next check out makes a new
   reservation.
5. **Orders** – the order list and a read-only order page with status, shipments, returns and credit notes. Keep it
   open in a second tab and press **Refresh** to follow the administration steps below.

### 3. Administration – monitor, fulfil, return, report

1. **Reservations** – a monitoring list (status, products, total, creation and expiry, where the stock is). Open a
   reservation for its products, quantities, timeline and an explanation of the stock: held until expiry, held by
   the order after payment, released on cancellation, or released by the background sweep after expiry.
   **Cancel reservation** (active ones only, with confirmation) releases the stock at once.
2. **Orders & Fulfilment → order details** – the **Next actions** card offers only what is currently possible:
   **Pack shipment…** (dialog; pack 2 of 3 units for a partial shipment), **Ship shipment #n**, **Deliver
   shipment #n**. The order becomes `IN_FULFILMENT` and, on shipping, on-hand stock (Inventory) drops to 8. Pack,
   ship and deliver the remaining unit: the order becomes `DELIVERED`. Order, shipment and return states are
   labelled separately ("Order: …", "Shipment: …").
3. **Record return…** (dialog) for delivered units with a reason and condition: unopened units are restocked,
   defective or opened units are discarded; a credit note is issued and the credited and net totals change.
4. **Reports** – low stock (available at or below the threshold), inventory aging and order cycle time
   (last 7/30/90 days).

### Reliability and errors

Reliability: the checkout request, its `Idempotency-Key` and the reservation id are stored in the browser and lock
the cart, so a refresh or a closed tab resumes the same reservation instead of creating a second one. If the
checkout request gets no answer (network failure or 5xx), the reservation may exist: the cart stays locked with
**Retry checkout**, which repeats the identical request with the same key and so cannot reserve twice; a definite
rejection (e.g. `INSUFFICIENT_STOCK`) unlocks the cart. The backend is authoritative for the checkout state: when a
confirmation or cancellation gets no answer, the checkout page reloads the reservation and acts on its real status
(opens the order via `GET /api/reservations/{id}/order`, returns to the cart, or stays active); while that status
cannot be loaded, payment and cancellation are hidden behind **Retry**. Confirming again uses the same payment
reference, so it returns the existing order. Leaving the checkout never cancels the reservation; it stays until it
is confirmed, cancelled or expires. Buttons
are disabled while a request is running, and retryable backend errors (e.g. `LOCK_CONFLICT`) are retried
automatically.

Operations that are not possible in the current state are hidden or explained (for example, returns before any
delivery). Reservations, shipments and returns are sent with an `Idempotency-Key`: retrying the identical request
after an error reuses its key, so a lost response never creates a duplicate; a changed request gets a new key.

## Tests and checks

```bash
npm test                          # Jest unit and component tests (API mocked, no backend needed)
npm run typecheck                 # tsc --noEmit
npm run lint                      # expo lint

npx playwright install chromium   # once
npm run e2e                       # Playwright end-to-end tests against the real backend
```

- **Unit tests** sit next to the code in `src/api`, `src/cart` and `src/utils`; **component tests** for the screens are in
  `src/__tests__` (expo-router mocked by `src/test-utils/expoRouterMock.tsx`).
- **E2E:** `npm run e2e` always starts its own backend with `../backend/start-e2e.sh` (Docker and `backend/.env`
  required): the `e2e` profile on port **8090**, against a throwaway PostgreSQL (Compose service `postgres-e2e`,
  port 5434, data in memory, recreated on every run). The tests therefore never touch the development database or a
  backend on port 8080, and the API URL is fixed in `e2e/api.ts` (it ignores `EXPO_PUBLIC_API_URL`). If port 8090
  is taken, the run stops with an error instead of reusing that server. It also builds its own web app with
  `EXPO_PUBLIC_API_URL=http://localhost:8090` and serves it on port **8082** with `npm run serve:web`, so it never
  reuses the Expo dev server (port 8081, which answers every path with the app and would hide missing-asset 404s);
  `npm run web` can keep running, as can the development backend. If port 8082 is taken, the run stops with an error
  instead of reusing it. A global setup first checks that the backend allows the `http://localhost:8082` origin (the
  default `app.cors.allowed-origins`). The tests create their own products with unique SKUs, so they can be
  repeated. The E2E database container lingers after a run (the next run replaces it); remove it with
  `cd ../backend && docker compose --profile e2e rm -sf postgres-e2e`.
  `deep-links.spec.ts` opens and reloads the customer and administration routes directly and checks the redirects;
  `modes.spec.ts` switches between the modes and checks the navigation on a phone-sized viewport;
  `shopping.spec.ts` covers shop, cart, checkout, refresh, payment, insufficient stock and cancellation;
  `inventory.spec.ts` product creation, validation, stock receipts, search and stock levels;
  `reservations.spec.ts` reservation inspection, cancellation and the link to the order;
  `fulfilment.spec.ts` partial packing, shipping, delivery and over-packing; `returns.spec.ts` returns and credit
  notes; `reports.spec.ts` the three reports.

## Production web export and deep links

```bash
npm run export:web                # production web build into dist/ (API URL: see the table above)
EXPO_PUBLIC_API_URL=http://localhost:8080 npm run export:web && npm run serve:web   # try the build locally
```

`expo export` produces a single-page app (`web.output: "single"`): one `index.html` plus hashed assets in `dist/`.
Routes such as `/orders/7` exist only in the browser, so the server must answer them with `index.html`. `expo serve`
does not do that (it returns 404), so `scripts/serve-web.js` (no dependencies) serves `dist/` with one rule:

- a path **without a file extension** is a client-side route and gets `/index.html`;
- any other path is a file and is served as-is, or **404** if it does not exist (a missing asset is not masked).

The AWS deployment (S3 + CloudFront, see [../infrastructure/README.md](../infrastructure/README.md)) applies the same
rule:

- **Default behaviour → S3 bucket** with the same rule as a viewer-request CloudFront Function
  (`if (!/\.[^/]+$/.test(request.uri)) request.uri = '/index.html';`).
- **`/api/*` behaviour → backend origin**, without that function, caching disabled, all HTTP methods, and the
  `Idempotency-Key` and `Content-Type` headers forwarded. `deployment/10-build-frontend.sh` builds without
  `EXPO_PUBLIC_API_URL`, so the app calls relative `/api/...` URLs: it works on any CloudFront or custom domain, and
  since browser and API share one origin, CORS is not needed there.
- No distribution-wide custom error responses (403/404 → `/index.html`): they would also replace the API's
  404 problem details with the HTML page.

Building and publishing the release: [../deployment/README.md](../deployment/README.md#updating-the-frontend).

## Project structure

```
frontend/
├── src/app/          routes (Expo Router): _layout (nav bar and mode switch), index, guide, (customer)/shop, cart,
│                     checkout/[id], orders/index, orders/[id]; admin/inventory, reservations/index,
│                     reservations/[id], orders/index, orders/[id], reports
├── src/cart/         cart state (React context + localStorage) and the persisted checkout record
├── src/screens/      order list and order details, shared by both modes
├── src/navigation.ts mode definitions and path → mode mapping
├── src/api/          fetch client, error mapping and DTO types
├── src/components/   small UI building blocks (Button, Field, Banner, ConfirmDialog, Table, forms, DemoGuide, …)
├── src/utils/        formatting, validation, idempotency keys, retries, storage, next-step hints
├── src/__tests__/    component tests; unit tests sit next to src/api and src/utils
├── scripts/          serve-web.js: static server for dist/ with the deep-link rule
└── e2e/              Playwright specs
```

## Limitations

- Local demo: no authentication or user accounts; anyone who can reach the backend can change data.
- Payments are simulated. The cart and checkout record live in one browser's storage; on native targets they are
  kept in memory only. Customer **Orders** lists all orders, since there are no accounts.
- Web is the only verified target. The app uses React Native components, but native iOS/Android builds, app icons
  and splash screens are not configured or tested.
- `scripts/serve-web.js` is for trying the production build locally, not a production server; it serves static
  files only, so a build with relative API URLs needs a proxy (e.g. CloudFront) that routes `/api/*` to the backend.
- Lists are paginated, but the product list is loaded in full (as the backend returns it); inventory search is
  done in the browser.
