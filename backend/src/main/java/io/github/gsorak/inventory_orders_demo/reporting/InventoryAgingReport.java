package io.github.gsorak.inventory_orders_demo.reporting;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record InventoryAgingReport(Instant asOf, String method, List<Item> products) {

        public static final String METHOD = "FIFO estimate: on-hand units are attributed to the most recent stock "
                        + "receipts, assuming the oldest units ship first. Physical lots are not tracked. Restocked returns "
                        + "count as new receipts on the return date.";

        public record Item(
                        Long productId,
                        String sku,
                        String name,
                        int onHand,
                        AgeBuckets unitsByAge,
                        BigDecimal averageAgeDays,
                        long oldestUnitAgeDays) {
        }

        /** Units on hand by age in whole days since receipt. */
        public record AgeBuckets(int days0To30, int days31To60, int days61To90, int over90Days) {
        }
}
