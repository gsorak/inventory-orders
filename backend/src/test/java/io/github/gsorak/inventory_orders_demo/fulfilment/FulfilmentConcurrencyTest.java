package io.github.gsorak.inventory_orders_demo.fulfilment;

import static io.github.gsorak.inventory_orders_demo.fulfilment.FulfilmentApiTest.itemId;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.Concurrently.Outcome;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class FulfilmentConcurrencyTest extends IntegrationTest {

    @Autowired
    FulfilmentService fulfilmentService;

    @Test
    void concurrentShipmentsNeverPackMoreThanOrdered() {
        long product = fixtures.createProduct("1.00", 10);
        OrderResponse order = fixtures.placeOrder(Map.of(product, 5));
        long item = itemId(order, product);

        List<Outcome<Long>> outcomes = Concurrently.run(12, i -> fixtures.pack(order.id(), Map.of(item, 1)));

        assertThat(outcomes.stream().filter(Outcome::succeeded)).hasSize(5);
        assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                        && e.code() == ErrorCode.QUANTITY_EXCEEDED);
        assertThat(fixtures.order(order.id()).items().getFirst().packedQuantity()).isEqualTo(5);
        invariants.assertOrderItemsConsistent(order.id());
    }

    @Test
    void concurrentShipRequestsRemoveStockExactlyOnce() {
        long product = fixtures.createProduct("1.00", 10);
        OrderResponse order = fixtures.placeOrder(Map.of(product, 3));
        long shipmentId = fixtures.pack(order.id(), Map.of(itemId(order, product), 3));

        List<Outcome<ShipmentResponse>> outcomes = Concurrently.run(10, i -> fulfilmentService.ship(shipmentId));

        assertThat(outcomes).allMatch(Outcome::succeeded);
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(7, 0, 7));
        invariants.assertOrderItemsConsistent(order.id());
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void concurrentShipAndDeliverOfDifferentShipmentsOfOneOrderKeepCountersConsistent() {
        long first = fixtures.createProduct("1.00", 20);
        long second = fixtures.createProduct("1.00", 20);
        OrderResponse order = fixtures.placeOrder(Map.of(first, 6, second, 6));
        List<Long> shipmentIds = List.of(
                fixtures.pack(order.id(), Map.of(itemId(order, first), 2, itemId(order, second), 1)),
                fixtures.pack(order.id(), Map.of(itemId(order, second), 2)),
                fixtures.pack(order.id(), Map.of(itemId(order, first), 3, itemId(order, second), 3)));

        // Every shipment gets several ship and deliver requests at once; deliver may
        // run before ship and fail.
        List<Outcome<ShipmentResponse>> outcomes = Concurrently.run(18, i -> {
            long shipmentId = shipmentIds.get(i % 3);
            return i % 2 == 0 ? fulfilmentService.ship(shipmentId) : fulfilmentService.deliver(shipmentId);
        });

        assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                        && e.code() == ErrorCode.INVALID_STATE_TRANSITION);
        assertThat(fixtures.stock(first)).isEqualTo(new StockLevels(15, 1, 14));
        assertThat(fixtures.stock(second)).isEqualTo(new StockLevels(14, 0, 14));
        invariants.assertOrderItemsConsistent(order.id());
        invariants.assertInventoryConsistent(first);
        invariants.assertInventoryConsistent(second);
    }
}
