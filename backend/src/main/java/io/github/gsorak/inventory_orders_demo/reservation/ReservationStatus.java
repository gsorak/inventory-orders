package io.github.gsorak.inventory_orders_demo.reservation;

/**
 * ACTIVE is the only non-terminal state. Stock is released exactly once, on the
 * transition to CANCELLED or EXPIRED.
 */
public enum ReservationStatus {
    ACTIVE,
    CONFIRMED,
    CANCELLED,
    EXPIRED
}
