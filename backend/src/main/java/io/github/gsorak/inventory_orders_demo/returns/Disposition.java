package io.github.gsorak.inventory_orders_demo.returns;

/**
 * RESTOCK puts the units back into on-hand (and available) stock; DISCARD
 * leaves inventory unchanged.
 */
public enum Disposition {
    RESTOCK,
    DISCARD
}
