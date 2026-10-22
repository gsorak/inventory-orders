-- Removes the leftovers of Playwright E2E runs from the DEVELOPMENT database, from before the E2E tests got their own
-- database. Run it through cleanup-e2e-data.sh, never by hand. A dry run unless called with -v execute=true: it only
-- creates session temp tables, then the transaction is made read-only and rolled back.
--
-- What counts as an E2E product (both must hold, so seed or manually created products are never matched):
--   * the SKU has the generated shape PREFIX-<base36 time>-<4 chars>[-A|-B], e.g. INV-MVHIRYQD-CYMZ
--   * the name is 'E2E lamp' or 'E2E ' || sku (the names the E2E specs use)
-- Their reservations, orders, shipments, returns, credit notes, stock receipts and inventory rows go with them.
-- Products with different SKUs are never merged. A reservation that also contains a non-E2E product is never deleted;
-- the E2E products on it are kept too and listed for manual review.
\set ON_ERROR_STOP on

BEGIN;

-- Plain CREATE TEMP TABLE + INSERT, so the helper tables exist only in this session.
CREATE TEMP TABLE e2e_product (id BIGINT, sku TEXT, name TEXT) ON COMMIT DROP;
INSERT INTO e2e_product
SELECT id, sku, name FROM product
 WHERE sku ~ '^[A-Z]+-[0-9A-Z]{6,10}-[0-9A-Z]{1,4}(-[A-Z])?$'
   AND (name = 'E2E lamp' OR name = 'E2E ' || sku);

-- A reservation that also holds a product outside the set (e.g. a seed product) is real data: leave it and every
-- product on it alone. Repeat until the set is stable, since dropping a product can make other reservations mixed.
DO $$
DECLARE removed INT;
BEGIN
    LOOP
        DELETE FROM e2e_product WHERE id IN (
            SELECT product_id FROM reservation_item
             WHERE reservation_id IN (SELECT reservation_id FROM reservation_item
                                       WHERE product_id NOT IN (SELECT id FROM e2e_product)));
        GET DIAGNOSTICS removed = ROW_COUNT;
        EXIT WHEN removed = 0;
    END LOOP;
END $$;

CREATE TEMP TABLE e2e_reservation (id BIGINT) ON COMMIT DROP;
INSERT INTO e2e_reservation
SELECT DISTINCT reservation_id FROM reservation_item WHERE product_id IN (SELECT id FROM e2e_product);

CREATE TEMP TABLE e2e_order (id BIGINT) ON COMMIT DROP;
INSERT INTO e2e_order
SELECT id FROM customer_order WHERE reservation_id IN (SELECT id FROM e2e_reservation);

CREATE TEMP TABLE e2e_shipment (id BIGINT) ON COMMIT DROP;
INSERT INTO e2e_shipment
SELECT id FROM shipment WHERE order_id IN (SELECT id FROM e2e_order);

CREATE TEMP TABLE e2e_return (id BIGINT) ON COMMIT DROP;
INSERT INTO e2e_return
SELECT id FROM order_return WHERE order_id IN (SELECT id FROM e2e_order);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM reservation_item
                WHERE reservation_id IN (SELECT id FROM e2e_reservation)
                  AND product_id NOT IN (SELECT id FROM e2e_product)) THEN
        RAISE EXCEPTION 'Aborting: an E2E reservation also contains a non-E2E product. Nothing was changed.';
    END IF;
    IF EXISTS (SELECT 1 FROM order_item
                WHERE product_id IN (SELECT id FROM e2e_product)
                  AND order_id NOT IN (SELECT id FROM e2e_order)) THEN
        RAISE EXCEPTION 'Aborting: an E2E product is on an order that is not linked to an E2E reservation. Nothing was changed.';
    END IF;
END $$;

CREATE TEMP TABLE before_counts (products BIGINT) ON COMMIT DROP;
INSERT INTO before_counts SELECT count(*) FROM product;

\if :execute
\else
-- From here on any write to the real tables fails.
SET TRANSACTION READ ONLY;
\endif

\echo
\echo 'Rows that match and would be deleted:'
SELECT 'product' AS "table", count(*) AS rows FROM e2e_product
UNION ALL SELECT 'inventory', count(*) FROM inventory WHERE product_id IN (SELECT id FROM e2e_product)
UNION ALL SELECT 'stock_receipt', count(*) FROM stock_receipt WHERE product_id IN (SELECT id FROM e2e_product)
UNION ALL SELECT 'reservation', count(*) FROM e2e_reservation
UNION ALL SELECT 'reservation_item', count(*) FROM reservation_item WHERE reservation_id IN (SELECT id FROM e2e_reservation)
UNION ALL SELECT 'customer_order', count(*) FROM e2e_order
UNION ALL SELECT 'order_item', count(*) FROM order_item WHERE order_id IN (SELECT id FROM e2e_order)
UNION ALL SELECT 'shipment', count(*) FROM e2e_shipment
UNION ALL SELECT 'shipment_item', count(*) FROM shipment_item WHERE shipment_id IN (SELECT id FROM e2e_shipment)
UNION ALL SELECT 'order_return', count(*) FROM e2e_return
UNION ALL SELECT 'return_item', count(*) FROM return_item WHERE return_id IN (SELECT id FROM e2e_return)
UNION ALL SELECT 'credit_note', count(*) FROM credit_note WHERE return_id IN (SELECT id FROM e2e_return);

\echo 'Products that are kept:'
SELECT count(*) AS products_kept FROM product WHERE id NOT IN (SELECT id FROM e2e_product);

\echo 'Kept products whose name starts with "E2E" (review: they did not match the strict pattern, or share a reservation with a non-E2E product):'
SELECT sku, name FROM product WHERE name ILIKE 'e2e%' AND id NOT IN (SELECT id FROM e2e_product) ORDER BY id;

\echo 'Most common names of the products that would be deleted:'
SELECT CASE WHEN name = 'E2E lamp' THEN name ELSE 'E2E <sku>' END AS name, count(*) AS products
  FROM e2e_product GROUP BY 1 ORDER BY 2 DESC;

\if :execute
DELETE FROM credit_note WHERE return_id IN (SELECT id FROM e2e_return);
DELETE FROM return_item WHERE return_id IN (SELECT id FROM e2e_return);
DELETE FROM order_return WHERE id IN (SELECT id FROM e2e_return);
DELETE FROM shipment_item WHERE shipment_id IN (SELECT id FROM e2e_shipment);
DELETE FROM shipment WHERE id IN (SELECT id FROM e2e_shipment);
DELETE FROM order_item WHERE order_id IN (SELECT id FROM e2e_order);
DELETE FROM customer_order WHERE id IN (SELECT id FROM e2e_order);
DELETE FROM reservation_item WHERE reservation_id IN (SELECT id FROM e2e_reservation);
DELETE FROM reservation WHERE id IN (SELECT id FROM e2e_reservation);
DELETE FROM stock_receipt WHERE product_id IN (SELECT id FROM e2e_product);
DELETE FROM inventory WHERE product_id IN (SELECT id FROM e2e_product);
DELETE FROM product WHERE id IN (SELECT id FROM e2e_product);

DO $$
BEGIN
    IF (SELECT count(*) FROM product) <> (SELECT products FROM before_counts) - (SELECT count(*) FROM e2e_product) THEN
        RAISE EXCEPTION 'Aborting: the product count is not what was expected. Rolling back.';
    END IF;
END $$;
COMMIT;
\echo 'Deleted. The changes are committed.'
\else
ROLLBACK;
\echo 'Dry run only: the transaction was read-only and nothing was changed. Use --execute to delete.'
\endif
