-- Sample data, loaded once when the database is created. Timestamps are relative to that moment.
-- Quantities satisfy every invariant (verified by SampleDataTest):
-- inventory.on_hand = received - shipped, inventory.reserved = 0 (no active reservations or unshipped orders).

INSERT INTO product (sku, name, unit_price, low_stock_threshold, created_at) VALUES
    ('LAMP-001',   'Desk lamp',       39.90,  5, CURRENT_TIMESTAMP - INTERVAL '120' DAY),
    ('BULB-9W',    'LED bulb 9W',      4.50, 20, CURRENT_TIMESTAMP - INTERVAL '120' DAY),
    ('CHAIR-ERGO', 'Ergonomic chair', 249.00, 2, CURRENT_TIMESTAMP - INTERVAL '120' DAY),
    ('MOUSE-WL',   'Wireless mouse',   24.99, 10, CURRENT_TIMESTAMP - INTERVAL '120' DAY),
    ('CABLE-USBC', 'USB-C cable 1m',    9.90, 15, CURRENT_TIMESTAMP - INTERVAL '120' DAY);

-- Back-dated purchases so that the inventory aging report has something to show.
INSERT INTO stock_receipt (product_id, quantity, source, received_at) VALUES
    ((SELECT id FROM product WHERE sku = 'LAMP-001'),    20, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '100' DAY),
    ((SELECT id FROM product WHERE sku = 'LAMP-001'),    15, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '20' DAY),
    ((SELECT id FROM product WHERE sku = 'BULB-9W'),    200, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '75' DAY),
    ((SELECT id FROM product WHERE sku = 'BULB-9W'),    100, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '10' DAY),
    ((SELECT id FROM product WHERE sku = 'CHAIR-ERGO'),   6, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '45' DAY),
    ((SELECT id FROM product WHERE sku = 'MOUSE-WL'),    40, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '5' DAY),
    ((SELECT id FROM product WHERE sku = 'CABLE-USBC'),  12, 'PURCHASE', CURRENT_TIMESTAMP - INTERVAL '120' DAY);

-- Two historical, fully delivered orders for the order cycle-time report.
-- Order 1: 2 desk lamps + 4 bulbs, paid 12 days ago, delivered 9 days ago (72 h).
INSERT INTO reservation (status, created_at, expires_at, confirmed_at) VALUES
    ('CONFIRMED', CURRENT_TIMESTAMP - INTERVAL '12' DAY - INTERVAL '5' MINUTE,
     CURRENT_TIMESTAMP - INTERVAL '12' DAY + INTERVAL '10' MINUTE, CURRENT_TIMESTAMP - INTERVAL '12' DAY);
INSERT INTO reservation_item (reservation_id, product_id, quantity, unit_price)
    SELECT (SELECT MAX(id) FROM reservation), id, 2, unit_price FROM product WHERE sku = 'LAMP-001';
INSERT INTO reservation_item (reservation_id, product_id, quantity, unit_price)
    SELECT (SELECT MAX(id) FROM reservation), id, 4, unit_price FROM product WHERE sku = 'BULB-9W';
INSERT INTO customer_order (reservation_id, payment_reference, status, gross_total, credited_total, confirmed_at,
                            delivered_at) VALUES
    ((SELECT MAX(id) FROM reservation), 'PAY-SEED-0001', 'DELIVERED', 97.80, 0.00,
     CURRENT_TIMESTAMP - INTERVAL '12' DAY, CURRENT_TIMESTAMP - INTERVAL '9' DAY);
INSERT INTO order_item (order_id, product_id, unit_price, quantity, packed_quantity, shipped_quantity,
                        delivered_quantity, returned_quantity)
    SELECT o.id, ri.product_id, ri.unit_price, ri.quantity, ri.quantity, ri.quantity, ri.quantity, 0
      FROM customer_order o JOIN reservation_item ri ON ri.reservation_id = o.reservation_id
     WHERE o.payment_reference = 'PAY-SEED-0001'
     ORDER BY ri.product_id;
INSERT INTO shipment (order_id, status, packed_at, shipped_at, delivered_at)
    SELECT id, 'DELIVERED', CURRENT_TIMESTAMP - INTERVAL '11' DAY, CURRENT_TIMESTAMP - INTERVAL '10' DAY,
           CURRENT_TIMESTAMP - INTERVAL '9' DAY
      FROM customer_order WHERE payment_reference = 'PAY-SEED-0001';
INSERT INTO shipment_item (shipment_id, order_item_id, quantity)
    SELECT (SELECT MAX(id) FROM shipment), oi.id, oi.quantity
      FROM order_item oi JOIN customer_order o ON o.id = oi.order_id
     WHERE o.payment_reference = 'PAY-SEED-0001';

-- Order 2: 1 ergonomic chair, paid 8 days ago, delivered 44 hours later.
INSERT INTO reservation (status, created_at, expires_at, confirmed_at) VALUES
    ('CONFIRMED', CURRENT_TIMESTAMP - INTERVAL '8' DAY - INTERVAL '5' MINUTE,
     CURRENT_TIMESTAMP - INTERVAL '8' DAY + INTERVAL '10' MINUTE, CURRENT_TIMESTAMP - INTERVAL '8' DAY);
INSERT INTO reservation_item (reservation_id, product_id, quantity, unit_price)
    SELECT (SELECT MAX(id) FROM reservation), id, 1, unit_price FROM product WHERE sku = 'CHAIR-ERGO';
INSERT INTO customer_order (reservation_id, payment_reference, status, gross_total, credited_total, confirmed_at,
                            delivered_at) VALUES
    ((SELECT MAX(id) FROM reservation), 'PAY-SEED-0002', 'DELIVERED', 249.00, 0.00,
     CURRENT_TIMESTAMP - INTERVAL '8' DAY, CURRENT_TIMESTAMP - INTERVAL '8' DAY + INTERVAL '44' HOUR);
INSERT INTO order_item (order_id, product_id, unit_price, quantity, packed_quantity, shipped_quantity,
                        delivered_quantity, returned_quantity)
    SELECT o.id, ri.product_id, ri.unit_price, ri.quantity, ri.quantity, ri.quantity, ri.quantity, 0
      FROM customer_order o JOIN reservation_item ri ON ri.reservation_id = o.reservation_id
     WHERE o.payment_reference = 'PAY-SEED-0002';
INSERT INTO shipment (order_id, status, packed_at, shipped_at, delivered_at)
    SELECT id, 'DELIVERED', CURRENT_TIMESTAMP - INTERVAL '8' DAY + INTERVAL '2' HOUR,
           CURRENT_TIMESTAMP - INTERVAL '8' DAY + INTERVAL '20' HOUR,
           CURRENT_TIMESTAMP - INTERVAL '8' DAY + INTERVAL '44' HOUR
      FROM customer_order WHERE payment_reference = 'PAY-SEED-0002';
INSERT INTO shipment_item (shipment_id, order_item_id, quantity)
    SELECT (SELECT MAX(id) FROM shipment), oi.id, oi.quantity
      FROM order_item oi JOIN customer_order o ON o.id = oi.order_id
     WHERE o.payment_reference = 'PAY-SEED-0002';

-- on_hand = received - shipped: lamp 35-2, bulb 300-4, chair 6-1, mouse 40, cable 12 (below its threshold of 15).
INSERT INTO inventory (product_id, on_hand, reserved) VALUES
    ((SELECT id FROM product WHERE sku = 'LAMP-001'),    33, 0),
    ((SELECT id FROM product WHERE sku = 'BULB-9W'),    296, 0),
    ((SELECT id FROM product WHERE sku = 'CHAIR-ERGO'),   5, 0),
    ((SELECT id FROM product WHERE sku = 'MOUSE-WL'),    40, 0),
    ((SELECT id FROM product WHERE sku = 'CABLE-USBC'),  12, 0);
