package io.github.gsorak.inventory_orders_demo.order;

/**
 * CONFIRMED (paid) → IN_FULFILMENT (first shipment packed) → DELIVERED (every
 * unit delivered).
 */
public enum OrderStatus {
    CONFIRMED,
    IN_FULFILMENT,
    DELIVERED
}
