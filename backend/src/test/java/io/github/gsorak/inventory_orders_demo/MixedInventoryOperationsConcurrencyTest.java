package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.fulfilment.FulfilmentService;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.returns.CreateReturnRequest;
import io.github.gsorak.inventory_orders_demo.returns.ItemCondition;
import io.github.gsorak.inventory_orders_demo.returns.ReturnReason;
import io.github.gsorak.inventory_orders_demo.returns.ReturnService;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.Concurrently.Outcome;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Reservations, shipments and restocking returns all updating the same
 * inventory row at the same time.
 */
class MixedInventoryOperationsConcurrencyTest extends IntegrationTest {

    private static final int SHIPMENTS = 3;
    private static final int UNITS_PER_SHIPMENT = 4;
    private static final int RESTOCKED_RETURNS = 6;
    private static final int RESERVATION_ATTEMPTS = 20;

    @Autowired
    FulfilmentService fulfilmentService;

    @Autowired
    ReturnService returnService;

    @Test
    void reservingShippingAndRestockingTheSameProductConcurrentlyKeepsInventoryConsistent() {
        long product = fixtures.createProduct("5.00", 30);
        OrderResponse returnSource = fixtures.placeOrder(Map.of(product, RESTOCKED_RETURNS));
        long returnableItem = returnSource.items().getFirst().id();
        fixtures.deliver(returnSource.id(), Map.of(returnableItem, RESTOCKED_RETURNS));
        List<OrderResponse> ordersToShip = new ArrayList<>();
        List<Long> packedShipments = new ArrayList<>();
        for (int i = 0; i < SHIPMENTS; i++) {
            OrderResponse order = fixtures.placeOrder(Map.of(product, UNITS_PER_SHIPMENT));
            ordersToShip.add(order);
            packedShipments.add(fixtures.pack(order.id(), Map.of(order.items().getFirst().id(), UNITS_PER_SHIPMENT)));
        }
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(24, 12, 12));
        CreateReturnRequest restockOne = new CreateReturnRequest(List.of(new CreateReturnRequest.Line(
                returnableItem, 1, ReturnReason.NO_LONGER_NEEDED, ItemCondition.UNOPENED)));

        List<Outcome<Object>> outcomes = Concurrently.run(SHIPMENTS + RESTOCKED_RETURNS + RESERVATION_ATTEMPTS, i -> {
            if (i < SHIPMENTS) {
                return fulfilmentService.ship(packedShipments.get(i));
            }
            if (i < SHIPMENTS + RESTOCKED_RETURNS) {
                return returnService.createReturn(returnSource.id(), restockOne, null);
            }
            return fixtures.reserve(product, 1);
        });

        List<Outcome<Object>> shipsAndReturns = outcomes.subList(0, SHIPMENTS + RESTOCKED_RETURNS);
        List<Outcome<Object>> reservations = outcomes.subList(SHIPMENTS + RESTOCKED_RETURNS, outcomes.size());
        assertThat(shipsAndReturns).allMatch(Outcome::succeeded);
        assertThat(reservations.stream().filter(outcome -> !outcome.succeeded()))
                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                        && e.code() == ErrorCode.INSUFFICIENT_STOCK);
        int reserved = (int) reservations.stream().filter(Outcome::succeeded).count();
        // 12 units were available at the start and restocking can add up to 6 more
        // while reservations run.
        assertThat(reserved).isBetween(12, 18);

        int expectedOnHand = 24 - SHIPMENTS * UNITS_PER_SHIPMENT + RESTOCKED_RETURNS;
        assertThat(fixtures.stock(product))
                .isEqualTo(new StockLevels(expectedOnHand, reserved, expectedOnHand - reserved));
        invariants.assertInventoryConsistent(product);
        invariants.assertOrderItemsConsistent(returnSource.id());
        invariants.assertOrderCreditConsistent(returnSource.id());
        ordersToShip.forEach(order -> invariants.assertOrderItemsConsistent(order.id()));
    }
}
