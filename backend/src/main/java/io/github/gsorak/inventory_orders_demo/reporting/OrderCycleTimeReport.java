package io.github.gsorak.inventory_orders_demo.reporting;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Cycle time of an order = its delivery time (last unit delivered) minus its
 * confirmation time (payment).
 * Covers orders fully delivered within [from, to). Statistics are null when
 * there are no such orders.
 */
public record OrderCycleTimeReport(
                Instant from,
                Instant to,
                int deliveredOrders,
                BigDecimal averageHours,
                BigDecimal medianHours,
                BigDecimal p90Hours,
                BigDecimal minHours,
                BigDecimal maxHours) {
}
