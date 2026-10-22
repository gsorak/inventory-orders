package io.github.gsorak.inventory_orders_demo.reporting;

import java.util.List;

public record LowStockReport(List<Item> items) {

    /**
     * A product whose available quantity is at or below its low-stock threshold.
     */
    public record Item(
            Long productId,
            String sku,
            String name,
            int onHand,
            int reserved,
            int available,
            int lowStockThreshold) {
    }
}
