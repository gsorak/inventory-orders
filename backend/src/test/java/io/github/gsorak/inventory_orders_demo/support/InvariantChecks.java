package io.github.gsorak.inventory_orders_demo.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Recomputes stored counters from the underlying rows and asserts they agree.
 * Run after concurrency tests to
 * prove that no update was lost or applied twice.
 */
public class InvariantChecks {

    private final JdbcTemplate jdbcTemplate;

    public InvariantChecks(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * reserved = units of stored-ACTIVE reservations + ordered units not yet
     * shipped;
     * on_hand = units received (purchases and restocked returns) − units shipped.
     */
    public void assertInventoryConsistent(long productId) {
        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT i.on_hand, i.reserved,
                       (SELECT COALESCE(SUM(ri.quantity), 0) FROM reservation_item ri
                          JOIN reservation r ON r.id = ri.reservation_id
                         WHERE r.status = 'ACTIVE' AND ri.product_id = i.product_id)
                     + (SELECT COALESCE(SUM(oi.quantity - oi.shipped_quantity), 0) FROM order_item oi
                         WHERE oi.product_id = i.product_id) AS expected_reserved,
                       (SELECT COALESCE(SUM(sr.quantity), 0) FROM stock_receipt sr
                         WHERE sr.product_id = i.product_id)
                     - (SELECT COALESCE(SUM(oi.shipped_quantity), 0) FROM order_item oi
                         WHERE oi.product_id = i.product_id) AS expected_on_hand
                  FROM inventory i WHERE i.product_id = ?
                """, productId);
        assertThat(number(row, "RESERVED")).as("reserved of product %d", productId)
                .isEqualTo(number(row, "EXPECTED_RESERVED"));
        assertThat(number(row, "ON_HAND")).as("on hand of product %d", productId)
                .isEqualTo(number(row, "EXPECTED_ON_HAND"));
    }

    /**
     * Each order item counter equals the sum of the shipment and return lines it
     * summarizes.
     */
    public void assertOrderItemsConsistent(long orderId) {
        jdbcTemplate.queryForList("""
                SELECT oi.id, oi.packed_quantity, oi.shipped_quantity, oi.delivered_quantity, oi.returned_quantity,
                       (SELECT COALESCE(SUM(si.quantity), 0) FROM shipment_item si
                         WHERE si.order_item_id = oi.id) AS expected_packed,
                       (SELECT COALESCE(SUM(si.quantity), 0) FROM shipment_item si
                          JOIN shipment s ON s.id = si.shipment_id
                         WHERE si.order_item_id = oi.id AND s.status IN ('SHIPPED', 'DELIVERED')) AS expected_shipped,
                       (SELECT COALESCE(SUM(si.quantity), 0) FROM shipment_item si
                          JOIN shipment s ON s.id = si.shipment_id
                         WHERE si.order_item_id = oi.id AND s.status = 'DELIVERED') AS expected_delivered,
                       (SELECT COALESCE(SUM(ri.quantity), 0) FROM return_item ri
                         WHERE ri.order_item_id = oi.id) AS expected_returned
                  FROM order_item oi WHERE oi.order_id = ?
                """, orderId).forEach(row -> {
            Object itemId = row.get("ID");
            assertThat(number(row, "PACKED_QUANTITY")).as("packed of item %s", itemId)
                    .isEqualTo(number(row, "EXPECTED_PACKED"));
            assertThat(number(row, "SHIPPED_QUANTITY")).as("shipped of item %s", itemId)
                    .isEqualTo(number(row, "EXPECTED_SHIPPED"));
            assertThat(number(row, "DELIVERED_QUANTITY")).as("delivered of item %s", itemId)
                    .isEqualTo(number(row, "EXPECTED_DELIVERED"));
            assertThat(number(row, "RETURNED_QUANTITY")).as("returned of item %s", itemId)
                    .isEqualTo(number(row, "EXPECTED_RETURNED"));
        });
    }

    /** credited_total = Σ credit notes = Σ refunds of the order's returns. */
    public void assertOrderCreditConsistent(long orderId) {
        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT o.credited_total,
                       (SELECT COALESCE(SUM(cn.amount), 0) FROM credit_note cn
                          JOIN order_return r ON r.id = cn.return_id WHERE r.order_id = o.id) AS credit_notes,
                       (SELECT COALESCE(SUM(ri.refund_amount), 0) FROM return_item ri
                          JOIN order_return r ON r.id = ri.return_id WHERE r.order_id = o.id) AS refunds
                  FROM customer_order o WHERE o.id = ?
                """, orderId);
        BigDecimal credited = (BigDecimal) row.get("CREDITED_TOTAL");
        assertThat(credited).isEqualByComparingTo((BigDecimal) row.get("CREDIT_NOTES"));
        assertThat(credited).isEqualByComparingTo((BigDecimal) row.get("REFUNDS"));
    }

    private static long number(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).longValue();
    }
}
