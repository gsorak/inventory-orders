package io.github.gsorak.inventory_orders_demo.reporting;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import io.github.gsorak.inventory_orders_demo.inventory.InventoryService;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.returns.CreateReturnRequest;
import io.github.gsorak.inventory_orders_demo.returns.ItemCondition;
import io.github.gsorak.inventory_orders_demo.returns.ReturnReason;
import io.github.gsorak.inventory_orders_demo.returns.ReturnService;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * The database is shared between tests, so assertions only look at this test's
 * own products and time window.
 */
class ReportApiTest extends IntegrationTest {

    @Autowired
    InventoryService inventoryService;

    @Autowired
    ReturnService returnService;

    @Test
    void lowStockListsProductsWhoseAvailableQuantityIsAtOrBelowTheThreshold() throws Exception {
        long mostlyReserved = fixtures.createProduct("1.00", 10, 5);
        long healthy = fixtures.createProduct("1.00", 10, 5);
        long soldOut = fixtures.createProduct("1.00", 0, 0);
        fixtures.reserve(mostlyReserved, 6);

        String product = "$.items[?(@.productId == %d)]";
        mockMvc.perform(get("/api/reports/low-stock"))
                .andExpect(status().isOk())
                .andExpect(jsonPath(product.formatted(mostlyReserved) + ".onHand").value(10))
                .andExpect(jsonPath(product.formatted(mostlyReserved) + ".reserved").value(6))
                .andExpect(jsonPath(product.formatted(mostlyReserved) + ".available").value(4))
                .andExpect(jsonPath(product.formatted(mostlyReserved) + ".lowStockThreshold").value(5))
                .andExpect(jsonPath(product.formatted(soldOut) + ".available").value(0))
                .andExpect(jsonPath(product.formatted(healthy)).isEmpty());
    }

    @Test
    void inventoryAgingAttributesOnHandUnitsToTheNewestReceipts() throws Exception {
        long product = fixtures.createProduct("1.00", 10);
        clock.advance(Duration.ofDays(40));
        inventoryService.receiveStock(product, 5);
        clock.advance(Duration.ofDays(30));

        // Ship 8 of 15: under FIFO the 7 left are the 5 received 30 days ago and 2 of
        // those received 70 days ago.
        OrderResponse order = fixtures.placeOrder(Map.of(product, 8));
        long item = order.items().getFirst().id();
        fixtures.deliver(order.id(), Map.of(item, 8));

        agingOf()
                .andExpect(jsonPath("$.method").value(org.hamcrest.Matchers.startsWith("FIFO estimate")))
                .andExpect(jsonPath(entry(product, "onHand")).value(7))
                .andExpect(jsonPath(entry(product, "unitsByAge.days0To30")).value(5))
                .andExpect(jsonPath(entry(product, "unitsByAge.days31To60")).value(0))
                .andExpect(jsonPath(entry(product, "unitsByAge.days61To90")).value(2))
                .andExpect(jsonPath(entry(product, "unitsByAge.over90Days")).value(0))
                .andExpect(jsonPath(entry(product, "averageAgeDays")).value(41.4))
                .andExpect(jsonPath(entry(product, "oldestUnitAgeDays")).value(70));

        // A restocked return is a new receipt; a discarded one never re-enters stock.
        returnService.createReturn(order.id(), new CreateReturnRequest(List.of(
                new CreateReturnRequest.Line(item, 1, ReturnReason.NO_LONGER_NEEDED, ItemCondition.UNOPENED),
                new CreateReturnRequest.Line(item, 1, ReturnReason.DEFECTIVE, ItemCondition.UNOPENED))), null);
        clock.advance(Duration.ofDays(25));

        agingOf()
                .andExpect(jsonPath(entry(product, "onHand")).value(8))
                .andExpect(jsonPath(entry(product, "unitsByAge.days0To30")).value(1))
                .andExpect(jsonPath(entry(product, "unitsByAge.days31To60")).value(5))
                .andExpect(jsonPath(entry(product, "unitsByAge.days61To90")).value(0))
                .andExpect(jsonPath(entry(product, "unitsByAge.over90Days")).value(2))
                .andExpect(jsonPath(entry(product, "oldestUnitAgeDays")).value(95));
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void orderCycleTimeMeasuresConfirmationToFinalDelivery() throws Exception {
        Instant windowStart = clock.instant();
        long product = fixtures.createProduct("1.00", 100);

        OrderResponse fast = fixtures.placeOrder(Map.of(product, 2));
        clock.advance(Duration.ofHours(1));
        OrderResponse slow = fixtures.placeOrder(Map.of(product, 2));
        OrderResponse incomplete = fixtures.placeOrder(Map.of(product, 2));
        clock.advance(Duration.ofHours(1));
        fixtures.deliver(fast.id(), Map.of(fast.items().getFirst().id(), 2));
        fixtures.deliver(slow.id(), Map.of(slow.items().getFirst().id(), 1));
        fixtures.deliver(incomplete.id(), Map.of(incomplete.items().getFirst().id(), 1));
        clock.advance(Duration.ofHours(5));
        fixtures.deliver(slow.id(), Map.of(slow.items().getFirst().id(), 1));
        Instant windowEnd = clock.instant().plusSeconds(1);

        mockMvc.perform(get("/api/reports/order-cycle-time")
                .param("from", windowStart.toString())
                .param("to", windowEnd.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deliveredOrders").value(2))
                .andExpect(jsonPath("$.averageHours").value(4.00))
                .andExpect(jsonPath("$.medianHours").value(4.00))
                .andExpect(jsonPath("$.p90Hours").value(6.00))
                .andExpect(jsonPath("$.minHours").value(2.00))
                .andExpect(jsonPath("$.maxHours").value(6.00));
    }

    @Test
    void orderCycleTimeRejectsAnEmptyOrInvertedWindow() throws Exception {
        Instant now = clock.instant();
        mockMvc.perform(get("/api/reports/order-cycle-time")
                .param("from", now.toString())
                .param("to", now.minusSeconds(60).toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/reports/order-cycle-time").param("from", "yesterday"))
                .andExpect(status().isBadRequest());
    }

    private ResultActions agingOf() throws Exception {
        return mockMvc.perform(get("/api/reports/inventory-aging")).andExpect(status().isOk());
    }

    private static String entry(long productId, String field) {
        return "$.products[?(@.productId == %d)].%s".formatted(productId, field);
    }
}
