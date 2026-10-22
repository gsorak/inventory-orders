package io.github.gsorak.inventory_orders_demo.fulfilment;

/** PACKED → SHIPPED → DELIVERED; no skipping and no going back. */
public enum ShipmentStatus {
    PACKED,
    SHIPPED,
    DELIVERED
}
