package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * The sample data migration (V2__sample_data.sql) is applied to every test
 * database; this checks that it obeys the
 * same invariants as live data.
 */
class SampleDataTest extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void sampleDataIsInternallyConsistent() {
        List<Long> productIds = jdbcTemplate.queryForList(
                "SELECT id FROM product WHERE sku IN ('LAMP-001', 'BULB-9W', 'CHAIR-ERGO', 'MOUSE-WL', 'CABLE-USBC')",
                Long.class);
        List<Long> orderIds = jdbcTemplate.queryForList(
                "SELECT id FROM customer_order WHERE payment_reference LIKE 'PAY-SEED-%'", Long.class);

        assertThat(productIds).hasSize(5);
        assertThat(orderIds).hasSize(2);
        productIds.forEach(invariants::assertInventoryConsistent);
        orderIds.forEach(invariants::assertOrderItemsConsistent);
        orderIds.forEach(invariants::assertOrderCreditConsistent);
    }
}
