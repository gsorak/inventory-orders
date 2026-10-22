# Inventory & Orders – backend

A self-contained Spring Boot backend that reserves stock at checkout, confirms orders on (simulated) payment,
fulfils them in partial shipments and processes returns, without overselling under concurrent load.
Overview of the whole project: [root README](../README.md); the browser UI is documented in
[frontend/README.md](../frontend/README.md).

**Stack:** Java 21 · Spring Boot 4.1 (Web MVC, Data JPA, Validation) · Hibernate 7 · PostgreSQL 17 · Flyway ·
JUnit 6 · Testcontainers. PostgreSQL runs in Docker (Docker Compose); no local database installation is needed.

**Contents:** [1. Quick start](#1-quick-start) · [2. Walkthrough with curl](#2-walkthrough-with-curl) ·
[3. Inventory model](#3-inventory-model) · [4. Concurrency and transactions](#4-concurrency-and-transactions) ·
[5. Returns, credit notes and reporting rules](#5-returns-credit-notes-and-reporting-rules) ·
[6. REST API](#6-rest-api) · [7. Project structure](#7-project-structure) · [8. Tests](#8-tests) ·
[9. Scope and assumptions](#9-scope-and-assumptions)

---

## 1. Quick start

Run every command in this README from the `backend/` directory.

### Prerequisites

- **JDK 21 or later, used by Maven.** The Maven Wrapper runs Maven (and the forked test JVM) on the JDK in
  `JAVA_HOME` if it is set, otherwise on the `java` found on `PATH`. Check the JDK Maven actually uses with
  `./mvnw -v` (the `Java version:` line must be 21 or higher), not only `java -version`: a `JAVA_HOME` exported by
  a shell profile (e.g. `~/.bash_profile` in bash, `~/.zshrc` in zsh) can point at an older JDK. The build stops
  with a "needs JDK 21" message if it runs on an older one; see [Troubleshooting](#troubleshooting).
- **Internet access on the first run.** The Maven Wrapper downloads Maven 3.10.0 and the dependencies; Maven does
  not need to be installed.
- **For the walkthrough:** `curl` and a bash or zsh shell (macOS, Linux, or WSL / Git Bash on Windows).
- **Docker** with the Compose plugin (e.g. Docker Desktop), running. Check with `docker compose version`. It runs
  the PostgreSQL 17 database and, during `./mvnw test`, the Testcontainers database.

### Configure the environment

Database settings come from environment variables. Create a local `backend/.env` (gitignored) from the template:

```bash
cp .env.example .env
```

| Variable      | Used by                 | Meaning                                                         |
| ------------- | ----------------------- | --------------------------------------------------------------- |
| `DB_USERNAME` | Compose and application | Database user (created when the volume is first initialised)    |
| `DB_PASSWORD` | Compose and application | Its password                                                    |
| `DB_PORT`     | Compose                 | Host port of the database container (default `5433`)            |
| `DB_URL`      | Application             | JDBC URL (default `jdbc:postgresql://localhost:5433/inventory`) |

The example values are for local development only; never commit `.env`. Credentials take effect only when the
database volume is created, so after changing them [reset the database](#reset-the-development-database).

### Start and stop PostgreSQL

```bash
docker compose up -d postgres   # start (reads .env); data is kept in the named volume postgres_data
docker compose ps               # STATUS shows "(healthy)" once it accepts connections
docker compose stop             # stop, keeping the data
docker compose down             # stop and remove the container, keeping the data
```

`compose.yaml` fixes the Compose project name to `inventory-orders` (container `inventory-orders-postgres-1`,
volume `inventory-orders_postgres_data`), so it does not depend on the directory name.

### Start the application

From `backend/`:

```bash
./start-dev.sh   # checks Docker and .env, starts PostgreSQL, waits until it is ready, runs the app
```

or, with PostgreSQL already running, load `.env` into the shell yourself:

```bash
set -a; source .env; set +a
./mvnw spring-boot:run      # Windows: set the variables, then mvnw.cmd spring-boot:run
```

On startup Flyway applies pending migrations from `src/main/resources/db/migration` (`V1` schema, `V2` sample data);
Hibernate then only validates the mappings against the schema. The application is ready when the log shows
`Started InventoryOrdersDemoApplication`. It listens on <http://localhost:8080>. Stop it with `Ctrl+C`.

- **Data persists across restarts.** The sample data is loaded once, when the database is created, and its
  timestamps are relative to that moment. The walkthrough's ids assume a fresh database: reset it first.
- **Port 8080 already in use:** start with `./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=9090`
  and use that port in the walkthrough's `B=` line.
- **Port 5433 already in use:** set another `DB_PORT` in `.env` and the same port in `DB_URL`.

### Reset the development database

```bash
docker compose down -v          # removes the container and the postgres_data volume (all data)
docker compose up -d postgres   # or ./start-dev.sh; Flyway recreates schema and sample data on app start
```

### Public demo mode

The `demo` profile (`app.demo.enabled=true`) is for a deployment that anonymous visitors can use. Products can then
only be created from the fixed list in `DemoProductCatalog` (each SKU and name exactly as listed, each once), so no
visitor can show free text to others. `GET /api/products/demo-catalog` lists the entries not created yet; the
frontend shows them as a choice instead of SKU and name fields. Without the profile (local development, tests, E2E)
any SKU and name are accepted and that endpoint returns 404.

The demo profile also enforces these limits (in `DemoMode`), rejecting anything else with 400 `INVALID_REQUEST`:

| Rule                | Demo limit                                                          |
| ------------------- | ------------------------------------------------------------------- |
| Product unit price  | at most 10,000.00                                                   |
| Low-stock threshold | at most 1,000                                                       |
| Stock receipt       | at most 1,000 units per receipt                                     |
| Reservation         | at most 20 units per product                                        |
| Payment reference   | exactly `SIM-<reservationId>`; this is the value the frontend sends |

```bash
SPRING_PROFILES_ACTIVE=demo ./start-dev.sh
```

### Reset the demo data (manual)

`scripts/reset-demo-data.sh` deletes all products, reservations, orders, shipments and returns and reloads the
sample data (`V2__sample_data.sql`) in one transaction. It is never scheduled; run it by hand. It shows the current
counts and asks for the database name before changing anything. The backend may keep running. IDs are not reused,
so carts and checkouts left in visitors' browsers cannot point at new rows.

```bash
./scripts/reset-demo-data.sh          # local development database (Compose service postgres)
PGHOST=… PGPORT=… PGDATABASE=… PGUSER=… PGPASSWORD=… ./scripts/reset-demo-data.sh --psql   # any reachable database
```

### Container image and health checks

`Dockerfile` builds the application on Java 21 and runs it as a non-root user (uid 1000) with the heap capped at 75%
of the container memory. `.dockerignore` admits only the Maven Wrapper, `pom.xml` and `src/main/`, so `.env` files,
backups and build output never reach the image. The container reads `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`,
`SPRING_PROFILES_ACTIVE` and `APP_CORS_ALLOWED_ORIGINS` from the environment. The AWS deployment runs the profiles
`demo,aws`; `application-aws.properties` disables CORS, because the web app and the API share one CloudFront origin.

```bash
docker build --platform linux/amd64 -t inventory-orders-backend:local .
```

Only the health endpoint is exposed, without details: `/actuator/health/readiness` (used by the load balancer) and
`/actuator/health/liveness`. Flyway migrates at startup; concurrent instances wait for its lock, and `clean` is
disabled. AWS deployment: [../deployment/README.md](../deployment/README.md); architecture:
[../infrastructure/README.md](../infrastructure/README.md).

### Run the tests

```bash
./mvnw test
```

Runs the whole suite. Integration tests start their own throwaway PostgreSQL 17 container via Testcontainers and
migrate it with Flyway, so they need Docker but neither `.env` nor the Compose database.

### E2E database

The Playwright tests (`cd ../frontend && npm run e2e`) run the application through `./start-e2e.sh`: the `e2e` Spring
profile (`application-e2e.properties`) on port **8090**, connected to the separate Compose service `postgres-e2e`
(database `inventory_e2e`, port 5434, data in tmpfs, started only with `--profile e2e` and recreated by every run).
The development database (`postgres`, port 5433) and a backend on port 8080 are never used or modified by the E2E
tests. Flyway loads the same schema and sample data into it. Remove a lingering container with
`docker compose --profile e2e rm -sf postgres-e2e`.

Adding a product with a new SKU always creates a new product; receiving stock (`POST /api/products/{id}/stock-receipts`)
updates the existing product's inventory, and a duplicate SKU is rejected with `409 ALREADY_EXISTS`. Products are never
merged by name.

### Remove old E2E data from the development database

Before the E2E tests had their own database they created products (names such as `E2E lamp` or `E2E <sku>`) in the
development database. `scripts/cleanup-e2e-data.sh` reviews and optionally removes them; the matching rules and the
deletion order are in `scripts/cleanup-e2e-data.sql`.

```bash
./scripts/cleanup-e2e-data.sh             # dry run: prints what would be deleted, changes nothing
./scripts/cleanup-e2e-data.sh --execute   # stop the backend first; shows the dry run, asks for confirmation,
                                          # writes a pg_dump backup to backups/ (gitignored), then deletes
```

Only generated E2E SKUs with the matching E2E names are removed, together with their reservations, orders, shipments,
returns, credit notes and stock receipts. E2E products that share a reservation with another product (for example a
seed product such as `LAMP-001`) are kept and listed for manual review. It only talks to the local Compose container.

### Troubleshooting

**`Rule 0: …RequireJavaVersion failed … This project needs JDK 21 or later`**, or (in builds without this check)
`UnsupportedClassVersionError: … class file version 61.0 … only recognizes class file versions up to 52.0`:
Maven runs on an older JDK (52 = Java 8), almost always because `JAVA_HOME` points at it. Find and fix it:

```bash
./mvnw -v | grep 'Java version'           # the JDK Maven uses
echo "$SHELL $JAVA_HOME"                    # current shell and its JAVA_HOME
grep -n JAVA_HOME ~/.bash_profile ~/.bashrc ~/.zshrc ~/.zprofile ~/.mavenrc 2>/dev/null
/usr/libexec/java_home -V                   # macOS: installed JDKs
export JAVA_HOME=$(/usr/libexec/java_home -v 21)   # this shell only (macOS); make it permanent in the profile
```

Different terminals can disagree: bash reads `~/.bash_profile`, zsh does not, so the same command can pass in one
and fail in the other.

---

## 2. Walkthrough with curl

Run these commands in order, in one shell session, against an application started on a freshly reset database.
Sample data: products 1–5 (`LAMP-001`, `BULB-9W`, `CHAIR-ERGO`, `MOUSE-WL`, `CABLE-USBC`) with back-dated receipts,
and two historical delivered orders (ids 1 and 2). The ids below assume the commands run in this order. The comment
under each command shows the expected response (shortened; timestamps differ).

```bash
B=http://localhost:8080; J='Content-Type: application/json'
curl() { command curl "$@"; echo; }   # print every response on its own line

# Stock levels
curl -s $B/api/products/1
# {"id":1,"sku":"LAMP-001",...,"stock":{"onHand":33,"reserved":0,"available":33}}

# 1. Checkout: reserve 2 lamps and 5 bulbs (reservation 3)
curl -s -X POST $B/api/reservations -H "$J" -H 'Idempotency-Key: checkout-42' \
  -d '{"items":[{"productId":1,"quantity":2},{"productId":2,"quantity":5}]}'
# 201 {"id":3,"status":"ACTIVE","expiresAt":"…+15 min","stockReleasedAt":null,"total":102.30,...}
curl -s $B/api/products/1          # stock: onHand 33, reserved 2, available 31

# Replaying the same request changes nothing (200); reusing the key for another request is rejected (422)
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/api/reservations -H "$J" -H 'Idempotency-Key: checkout-42' \
  -d '{"items":[{"productId":1,"quantity":2},{"productId":2,"quantity":5}]}'
curl -s -X POST $B/api/reservations -H "$J" -H 'Idempotency-Key: checkout-42' \
  -d '{"items":[{"productId":1,"quantity":3}]}'
# {"status":422,"code":"IDEMPOTENCY_KEY_REUSED",...}

# Overselling is rejected (this consumes reservation id 4, which is rolled back)
curl -s -X POST $B/api/reservations -H "$J" -d '{"items":[{"productId":3,"quantity":99}]}'
# {"status":409,"code":"INSUFFICIENT_STOCK","productId":3,"requested":99,"available":5,...}

# 2. Payment succeeded → order 3 with items 4 (lamp) and 5 (bulb); stock stays reserved
curl -s -X POST $B/api/reservations/3/confirm -H "$J" -d '{"paymentReference":"PAY-42"}'
# 201 {"id":3,"status":"CONFIRMED","grossTotal":102.30,"items":[{"id":4,...},{"id":5,...}]}

# 3. Partial fulfilment: shipment 3 = 2 lamps + 3 bulbs, shipment 4 = remaining 2 bulbs
curl -s -X POST $B/api/orders/3/shipments -H "$J" \
  -d '{"items":[{"orderItemId":4,"quantity":2},{"orderItemId":5,"quantity":3}]}'      # 201 PACKED
curl -s -X POST $B/api/shipments/3/ship                                              # SHIPPED
curl -s $B/api/products/1          # stock: onHand 31, reserved 0, available 31 (unchanged by shipping)
curl -s -X POST $B/api/shipments/3/deliver                                           # DELIVERED
curl -s -X POST $B/api/orders/3/shipments -H "$J" -d '{"items":[{"orderItemId":5,"quantity":2}]}'
curl -s -X POST $B/api/shipments/4/ship
curl -s -X POST $B/api/shipments/4/deliver
curl -s $B/api/orders/3            # "status":"DELIVERED","deliveredAt":...

# Over-shipment is rejected
curl -s -X POST $B/api/orders/3/shipments -H "$J" -d '{"items":[{"orderItemId":5,"quantity":1}]}'
# {"status":409,"code":"QUANTITY_EXCEEDED","detail":"Cannot pack 1 units of order item 5: only 0 remain unpacked",...}

# 4. Return 1 lamp (unopened → RESTOCK) and 2 bulbs (damaged → DISCARD)
curl -s -X POST $B/api/orders/3/returns -H "$J" -H 'Idempotency-Key: return-42-1' -d '{"items":[
  {"orderItemId":4,"quantity":1,"reason":"NO_LONGER_NEEDED","condition":"UNOPENED"},
  {"orderItemId":5,"quantity":2,"reason":"DAMAGED_IN_TRANSIT","condition":"DAMAGED"}]}'
# 201 {"items":[{..."disposition":"RESTOCK","refundAmount":39.90},{..."disposition":"DISCARD","refundAmount":9.00}],
#      "creditNote":{"number":"CN-000001","amount":48.90,...},
#      "orderTotals":{"grossTotal":102.30,"creditedTotal":48.90,"netTotal":53.40}}
curl -s $B/api/products/1          # onHand 32: the restocked lamp is available again

# 5. Cancellation releases stock immediately (reservation 5)
curl -s -X POST $B/api/reservations -H "$J" -d '{"items":[{"productId":4,"quantity":1}]}'
curl -s -X POST $B/api/reservations/5/cancel
# {"id":5,"status":"CANCELLED","stockReleasedAt":"…",...}

# 6. Reports
curl -s $B/api/reports/low-stock
# {"items":[{"productId":5,"sku":"CABLE-USBC","onHand":12,"reserved":0,"available":12,"lowStockThreshold":15}]}
curl -s $B/api/reports/inventory-aging
# {"method":"FIFO estimate: …","products":[{"productId":1,"onHand":32,
#   "unitsByAge":{"days0To30":16,"days31To60":0,"days61To90":0,"over90Days":16},"averageAgeDays":59.4,...},...]}
curl -s $B/api/reports/order-cycle-time
# {"deliveredOrders":3,"averageHours":…,"medianHours":44.00,"p90Hours":72.00,...}
```

**Expected end state:** the desk lamp (product 1) has `onHand 32, reserved 0, available 32` (33 − 2 shipped + 1
restocked); order 3 is `DELIVERED` with gross 102.30, credited 48.90 and net 53.40; credit note `CN-000001` was
issued for 48.90; the two damaged bulbs were discarded, not restocked; reservation 5 is `CANCELLED` and its mouse is
available again.

To watch an expiry, create a reservation and wait 15 minutes, or start with a shorter TTL:
`./mvnw spring-boot:run -Dspring-boot.run.arguments="--inventory.reservation.ttl=PT30S --inventory.reservation.expiry-sweep-interval=PT10S"`.

---

## 3. Inventory model

Each product has one `inventory` row with two stored quantities; `available` is always derived.

| Quantity    | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `on_hand`   | Units physically in the warehouse (including reserved units)                                |
| `reserved`  | Units held by ACTIVE reservations, plus units of confirmed orders that have not shipped yet |
| `available` | `on_hand − reserved`: what a new checkout may take                                          |

Database CHECK: `0 ≤ reserved ≤ on_hand`, so `available` can never be negative.

| Operation                 | on_hand | reserved | available | Notes                                            |
| ------------------------- | :-----: | :------: | :-------: | ------------------------------------------------ |
| Receive stock             |   +q    |          |    +q     | Adds a `PURCHASE` stock receipt                  |
| Create reservation        |         |    +q    |    −q     | Only if `available ≥ q` for every line           |
| Cancel / expire (sweeper) |         |    −q    |    +q     | Exactly once, on the transition out of ACTIVE    |
| Confirm payment           |         |          |           | Units stay reserved, now on behalf of the order  |
| Pack shipment             |         |          |           | Claims order quantity only; goods still in house |
| Ship                      |   −q    |    −q    |   **0**   | Goods leave; availability does not change        |
| Deliver                   |         |          |           | Completes the order when every unit is delivered |
| Return → RESTOCK          |   +q    |          |    +q     | Adds a `RETURN` stock receipt                    |
| Return → DISCARD          |         |          |           | Never re-enters inventory                        |

### Invariants (enforced by the code, backed by CHECK constraints, verified by tests)

```
inventory:   0 ≤ reserved ≤ on_hand
             reserved = Σ qty of reservations with persisted status ACTIVE (including logically expired ones
                        the sweeper has not processed yet) + Σ (ordered − shipped) over order items
             on_hand  = Σ stock receipts (purchases + restocked returns) − Σ shipped
order item:  0 ≤ returned ≤ delivered ≤ shipped ≤ packed ≤ quantity
             packed    = Σ shipment lines of the item (any shipment state)
             shipped   = Σ shipment lines in SHIPPED or DELIVERED shipments
             delivered = Σ shipment lines in DELIVERED shipments
             returned  = Σ return lines of the item
order:       0 ≤ credited_total = Σ credit notes ≤ gross_total;  net_total = gross_total − credited_total
```

The test helper `InvariantChecks` recomputes every summary counter from the underlying rows and is run throughout the
lifecycle and concurrency tests, so a lost or doubled update would fail the build.

### State machines

Detailed diagrams: [docs/lifecycle-state-machines.md](../docs/lifecycle-state-machines.md) (lifecycles and how they
interact) and [docs/inventory-accounting.md](../docs/inventory-accounting.md) (quantities, invariants and a worked
example).

```
Reservation:  ACTIVE ─confirm→ CONFIRMED          Shipment:  PACKED ─ship→ SHIPPED ─deliver→ DELIVERED
                     ─cancel─→ CANCELLED          Order:     CONFIRMED ─first pack→ IN_FULFILMENT
                     ─sweeper→ EXPIRED                       ─all units delivered→ DELIVERED
```

Repeating a transition that has already happened (cancel a cancelled reservation, confirm with the same payment
reference, ship a shipped shipment) is an idempotent no-op returning `200`. Any other invalid transition returns
`409 INVALID_STATE_TRANSITION`.

### Logical expiry versus physical release

A reservation expires in two steps:

1. **Logically expired** as soon as `now ≥ expiresAt`. It is reported with `status: EXPIRED` and can no longer be
   confirmed (`409 RESERVATION_EXPIRED`) or cancelled. Its stock is **still reserved**, and `stockReleasedAt` is `null`.
2. **Physically released** when the scheduled sweeper (`inventory.reservation.expiry-sweep-interval`, default 30 s)
   stores status `EXPIRED`, returns the units to availability and sets `stockReleasedAt`.

So stock of an expired checkout becomes available again at most one sweep interval after expiry. A payment arriving
in that gap is rejected; it can never resurrect the reservation. Tests cover both steps, repeated sweeps and
concurrent sweeps.

---

## 4. Concurrency and transactions

Correctness relies on the database, not on JVM locks, so it also holds with several application instances.

1. **Inventory counters change only through conditional atomic UPDATEs**, never through read-modify-write in Java:
   ```sql
   UPDATE inventory SET reserved = reserved + :q WHERE product_id = :p AND on_hand - reserved >= :q
   ```
   0 updated rows means insufficient stock; the service throws and the whole transaction rolls back, so a
   multi-item reservation is all-or-nothing. A concurrent UPDATE of the same row waits for the row lock and is then
   evaluated against the committed values (proven by
   `ReservationConcurrencyTest#reservationWaitsForTheRowLockAndReevaluatesAvailabilityAfterTheOtherTransactionCommits`).
2. **Lifecycle changes take a pessimistic row lock** (`SELECT … FOR UPDATE`) on the aggregate root and re-read its
   state after the lock is granted: the reservation row for confirm/cancel/expire, the order row for every shipment
   and return operation. Confirm, cancel and expiry of one reservation are therefore mutually exclusive: whichever
   runs first wins and the others see its result, so stock is released at most once.
3. **CHECK constraints** (`reserved ≤ on_hand`, `returned ≤ delivered ≤ shipped ≤ packed ≤ quantity`,
   `credited ≤ gross`, status/timestamp consistency) are the last line of defence: a bug that would violate an
   invariant fails the transaction instead of committing.

**Isolation:** READ COMMITTED (the PostgreSQL default) is sufficient because correctness comes from row locks
and conditional writes, not from snapshot reads. Reports use REPEATABLE READ (read-only) to see one consistent
snapshot without blocking writers.

### Lock acquisition order

| Operation               | Locks taken, in order                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Receive stock           | inventory row                                                                              |
| Create reservation      | new reservation row (+ idempotency-key index entry) → inventory rows, ascending product id |
| Cancel / expire         | reservation row → inventory rows, ascending product id                                     |
| Confirm payment         | reservation row → new order row                                                            |
| Pack shipment / deliver | order row → its order items and shipments                                                  |
| Ship                    | order row → order items and shipment → inventory rows, ascending product id                |
| Return                  | order row → order items, return, credit note → inventory rows, ascending product id        |
| Reports                 | none (snapshot reads)                                                                      |

Every transaction locks at most one reservation **or** one order, always before any inventory row, and inventory
rows always in ascending product id order (enforced by passing quantities as a `SortedMap`). This rules out the
lock cycles we know of. It does **not** make deadlocks impossible: the database may still detect a deadlock or hit
the lock timeout (`lock_timeout = 10s`, set per connection), e.g. through foreign-key or index locks, or future code.
Then:

- the transaction is rolled back completely, so no partial effects remain;
- the API responds `409` with `code: LOCK_CONFLICT`, `retryable: true` and `Retry-After: 1`;
- the expiry sweeper logs it and retries that reservation on its next run.

There is no automatic server-side retry; clients retry, ideally with an `Idempotency-Key`.

### Duplicate requests and idempotency

- `POST /api/reservations`, `POST /api/orders/{id}/shipments` and `POST /api/orders/{id}/returns` accept an optional
  `Idempotency-Key` header (1–100 chars). The key is stored in a unique column together with a SHA-256 fingerprint
  of the canonical request (sorted lines; for shipments and returns, also the order id).
  - Same key, same request → `200` with the original resource; nothing is applied twice.
  - Same key, different request (or a different order) → `422 IDEMPOTENCY_KEY_REUSED`.
  - Two simultaneous first requests with the same key → the unique constraint lets exactly one commit (`201`). Each
    request that loses the insert race is rolled back and gets `409` with `code: DATA_CONFLICT` (this response
    carries no `retryable` flag or `Retry-After` header). Retrying with the same key and request is safe: it returns
    the winner's reservation with `200`. Verified over HTTP by
    `ReservationConcurrencyTest#concurrentFirstRequestsWithTheSameIdempotencyKeyCreateOneReservation`.
- Payment confirmation is naturally idempotent: one order per reservation (unique `reservation_id`); repeating with
  the same `paymentReference` returns the order (`200`), a different reference returns `409`. A payment reference
  cannot be reused for another reservation.
- Even without a key, quantity invariants make over-shipping and over-returning impossible.

### PostgreSQL notes

- The design uses only standard features (`FOR UPDATE`, conditional UPDATE, CHECK, unique constraints).
- The re-evaluation of a conditional UPDATE after a lock wait is documented by PostgreSQL for READ COMMITTED and
  verified by the test above, which confirms through `pg_stat_activity` that the second transaction is waiting.
- The lock timeout is set for every pooled connection (`spring.datasource.hikari.connection-init-sql`); a timeout
  (SQLSTATE `55P03`) and a detected deadlock (`40P01`) both map to `409 LOCK_CONFLICT`.
- With several instances on PostgreSQL, the sweeper would use `FOR UPDATE SKIP LOCKED` to avoid instances queueing
  on the same rows; correctness does not depend on it.

---

## 5. Returns, credit notes and reporting rules

**Disposition** (`ReturnPolicy`): RESTOCK only if the condition is `UNOPENED` **and** the reason is
`NO_LONGER_NEEDED` or `WRONG_ITEM_SENT`; everything else (`DEFECTIVE`, `DAMAGED_IN_TRANSIT`, or condition
`OPENED`/`DAMAGED`) is DISCARD.

**Refund:** the unit price paid × quantity, for both dispositions (no fees, tax or shipping). Each return issues one
simulated credit note (`CN-000001`, …) for the sum of its lines, and the order's `creditedTotal` and `netTotal` are
adjusted. Only delivered, not-yet-returned units can be returned; partial and repeated returns are allowed up to
that limit.

**Low stock:** products whose `available ≤ lowStockThreshold`. Based on available rather than on-hand, because
reserved units cannot be sold. Pull-based report; no notifications.

**Inventory aging is a FIFO estimate, not lot tracking.** Stock receipts (purchases and restocked returns) are
timestamped by the server and never back-dated, and on-hand stock only decreases by shipping. Assuming the oldest
units ship first, the units on hand are the most recent receipts adding up to `on_hand`; the report attributes them
accordingly and buckets them by age (0–30, 31–60, 61–90, > 90 days), with a weighted average and the oldest unit's
age. If the warehouse picks differently, actual ages differ; the response states its method. Restocked returns
count as new receipts on the return date (their original age is not carried over). Aging is reported as of now only.

**Order cycle time:** from payment confirmation to the delivery of the last unit, for orders fully delivered within
`[from, to)` (default: the last 30 days). Reports count, average, median, 90th percentile, min and max, in hours.

---

## 6. REST API

All errors are RFC 9457 problem details with a machine-readable `code` (validation errors also list `errors`).

| Method & path                                 | Purpose                                         | Success          | Typical errors                                         |
| --------------------------------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `POST /api/products`                          | Create product                                  | 201              | 400, 409 `ALREADY_EXISTS`                              |
| `GET /api/products/demo-catalog`              | Public demo: catalogue products not created yet | 200              | 404 outside the public demo                            |
| `GET /api/products`, `GET /api/products/{id}` | Product with on-hand / reserved / available     | 200              | 404                                                    |
| `POST /api/products/{id}/stock-receipts`      | Receive stock                                   | 201              | 400, 404                                               |
| `POST /api/reservations`                      | Start checkout (multi-line)                     | 201 / 200 replay | 400, 404, 409 `INSUFFICIENT_STOCK`, 422                |
| `GET /api/reservations?page=&size=`           | Reservations, newest first (paginated)          | 200              | 400                                                    |
| `GET /api/reservations/{id}`                  | Reservation (effective status)                  | 200              | 404                                                    |
| `POST /api/reservations/{id}/cancel`          | Cancel and release stock                        | 200              | 409 `RESERVATION_EXPIRED` / `INVALID_STATE_TRANSITION` |
| `POST /api/reservations/{id}/confirm`         | Simulated successful payment → order            | 201 / 200 repeat | 409 `RESERVATION_EXPIRED` / `INVALID_STATE_TRANSITION` |
| `GET /api/reservations/{id}/order`            | The order created from the reservation          | 200              | 404 (unknown or not confirmed yet)                     |
| `GET /api/orders?page=&size=`                 | Orders, newest first (paginated)                | 200              | 400                                                    |
| `GET /api/orders/{id}`                        | Order, item counters, gross/credited/net totals | 200              | 404                                                    |
| `POST /api/orders/{id}/shipments`             | Pack a (partial) shipment                       | 201 / 200 replay | 400, 409 `QUANTITY_EXCEEDED`, 422                      |
| `GET /api/orders/{id}/shipments`              | Shipments of an order, oldest first             | 200              | 404                                                    |
| `GET /api/shipments/{id}`                     | Shipment                                        | 200              | 404                                                    |
| `POST /api/shipments/{id}/ship`               | PACKED → SHIPPED                                | 200              | 409 `INVALID_STATE_TRANSITION`                         |
| `POST /api/shipments/{id}/deliver`            | SHIPPED → DELIVERED                             | 200              | 409 `INVALID_STATE_TRANSITION`                         |
| `POST /api/orders/{id}/returns`               | Return delivered units, issue credit note       | 201 / 200 replay | 400, 409 `QUANTITY_EXCEEDED`, 422                      |
| `GET /api/orders/{id}/returns`                | Returns of an order with credit notes           | 200              | 404                                                    |
| `GET /api/returns/{id}`                       | Return with credit note                         | 200              | 404                                                    |
| `GET /api/reports/low-stock`                  | Low-stock alerts                                | 200              |                                                        |
| `GET /api/reports/inventory-aging`            | FIFO-estimated aging buckets                    | 200              |                                                        |
| `GET /api/reports/order-cycle-time?from=&to=` | Cycle-time statistics (ISO-8601 instants)       | 200              | 400                                                    |

Any lock timeout or detected deadlock returns `409 LOCK_CONFLICT` (retryable).

Paginated lists take `page` (0-based, default 0) and `size` (1–100, default 20) and return
`{"items":[…],"page":0,"size":20,"totalElements":42,"totalPages":3}`; invalid values return `400 VALIDATION_FAILED`.

CORS: `app.cors.allowed-origins` (comma-separated) lists browser origins allowed to call `/api/**` with `GET`/`POST`.
It defaults to the Expo web dev server `http://localhost:8081` and the production build served for the Playwright
E2E tests `http://localhost:8082`; an empty value disables CORS.

---

## 7. Project structure

```
backend/
├── src/main/java/…        application code (packages below)
├── src/main/resources/    application.properties, db/migration/ (Flyway: V1 schema, V2 sample data)
├── src/test/java/…        tests (see section 8)
├── compose.yaml, .env.example, start-dev.sh   local PostgreSQL 17 and startup script
├── start-e2e.sh, scripts/  throwaway E2E database + backend (profile e2e); cleanup of old E2E data in the dev database
├── pom.xml, mvnw, mvnw.cmd, .mvn/   Maven build and Maven Wrapper
└── README.md
```

The diagrams live in the shared [`docs/`](../docs) folder at the repository root.

```
io.github.gsorak.inventory_orders_demo
├── common       error codes and RFC 9457 handler, idempotency fingerprinting, clock, scheduling switch
├── inventory    Product, Inventory (read-only quantities), StockReceipt, atomic InventoryRepository, InventoryService
├── reservation  Reservation lifecycle, ReservationService, ReservationExpirySweeper
├── order        CustomerOrder, OrderItem (fulfilment counters), payment confirmation
├── fulfilment   Shipment, ShipmentItem, FulfilmentService
├── returns      OrderReturn, ReturnItem, ReturnPolicy, CreditNote, ReturnService
└── reporting    low-stock, inventory-aging and order-cycle-time reports
```

- The Flyway migrations are the only source of the schema (including all CHECK constraints); Hibernate only
  validates it (`ddl-auto=validate`). `V2__sample_data.sql` loads the sample data (also verified against the
  invariants by `SampleDataTest`). Schema changes go into new migrations; never edit an applied one.
- Business rules live in the entities (`Reservation.confirm`, `OrderItem.pack`, `Shipment.ship`, `ReturnPolicy`);
  services own transactions and lock order; controllers only map HTTP to DTO records.
- All time comes from an injected `Clock`, so tests control expiry, aging and cycle times precisely.

## 8. Tests

Run with `./mvnw test` (requires a running Docker daemon). Integration tests share one Spring context backed by a
PostgreSQL 17 Testcontainer (`PostgresTestcontainersConfig`), migrated by Flyway at startup
(`InventoryOrdersDemoApplicationTests` checks the applied versions). `ApiExceptionHandlerTest` and `ReturnPolicyTest`
are fast tests without a database.

- **API tests** (MockMvc, full context) for every endpoint, including validation, error codes and idempotency.
- **Concurrency tests**: each task runs on its own thread and commits its own transaction, released together by a
  latch: 40 checkouts for 10 units (exactly 10 succeed), multi-item reservations in opposite line orders (atomic, no
  deadlock), confirm racing cancel, confirm racing the sweeper, concurrent sweeps, concurrent cancels, concurrent
  same-key requests, concurrent packing beyond the ordered quantity, concurrent ship/deliver, concurrent returns,
  and reservations, shipments and restocking returns hitting the same product at once
  (`MixedInventoryOperationsConcurrencyTest`).
  A latch-controlled test proves a second transaction really blocks on the row lock and then sees the committed result.
- **Invariant checks** recompute all counters from source rows after reservation, confirmation, cancellation,
  expiry (including the interval between logical expiry and the sweep), fulfilment, return, concurrency and workflow
  tests.
- `InventoryAccountingExampleTest` executes the numerical example of
  [docs/inventory-accounting.md](../docs/inventory-accounting.md) step by step.
- An end-to-end test (`CheckoutToReturnWorkflowTest`) mirrors the [walkthrough](#2-walkthrough-with-curl).

## 9. Scope and assumptions

- Reservations and orders are separate: the order is created on payment confirmation; payment itself is simulated
  (a failed payment simply means the client cancels).
- Out of scope: customers, authentication, cancelling paid orders or shipments, tax, shipping fees, multiple
  currencies, warehouse locations and physical lot tracking.
- Returns do not change the order status; they adjust its financial totals.
- Prices are captured at checkout; later product price changes do not affect existing reservations or orders.
