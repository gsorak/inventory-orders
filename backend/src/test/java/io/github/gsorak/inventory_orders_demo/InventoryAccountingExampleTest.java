package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.fulfilment.FulfilmentService;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.order.OrderStatus;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationExpirySweeper;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationRepository;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationService;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationStatus;
import io.github.gsorak.inventory_orders_demo.returns.CreateReturnRequest;
import io.github.gsorak.inventory_orders_demo.returns.Disposition;
import io.github.gsorak.inventory_orders_demo.returns.ItemCondition;
import io.github.gsorak.inventory_orders_demo.returns.ReturnReason;
import io.github.gsorak.inventory_orders_demo.returns.ReturnResponse;
import io.github.gsorak.inventory_orders_demo.returns.ReturnService;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * The numerical example of docs/inventory-accounting.md, step by step, with the
 * invariants checked after each step.
 */
class InventoryAccountingExampleTest extends IntegrationTest {

        @Autowired
        ReservationService reservationService;

        @Autowired
        ReservationRepository reservationRepository;

        @Autowired
        ReservationExpirySweeper sweeper;

        @Autowired
        FulfilmentService fulfilmentService;

        @Autowired
        ReturnService returnService;

        @Test
        void quantitiesFollowTheDocumentedExample() {
                long product = fixtures.createProduct("10.00", 10);
                assertStep(product, new StockLevels(10, 0, 10));

                long reservationA = fixtures.reserve(product, 3);
                assertStep(product, new StockLevels(10, 3, 7));

                long reservationB = fixtures.reserve(product, 2);
                assertStep(product, new StockLevels(10, 5, 5));

                OrderResponse order = fixtures.confirm(reservationA);
                assertStep(product, new StockLevels(10, 5, 5));

                // Logical expiry of B: effective status EXPIRED, persisted status still ACTIVE,
                // units still reserved.
                clock.advance(Duration.ofMinutes(15));
                assertThat(reservationService.get(reservationB).status()).isEqualTo(ReservationStatus.EXPIRED);
                assertThat(reservationService.get(reservationB).stockReleasedAt()).isNull();
                assertThat(reservationRepository.findById(reservationB).orElseThrow().getStatus())
                                .isEqualTo(ReservationStatus.ACTIVE);
                assertStep(product, new StockLevels(10, 5, 5));

                sweeper.expireDueReservations();
                assertThat(reservationRepository.findById(reservationB).orElseThrow().getStatus())
                                .isEqualTo(ReservationStatus.EXPIRED);
                assertStep(product, new StockLevels(10, 3, 7));

                long item = order.items().getFirst().id();
                long shipmentId = fixtures.pack(order.id(), Map.of(item, 3));
                assertStep(product, new StockLevels(10, 3, 7));
                assertThat(inTransit(order.id())).isZero();

                fulfilmentService.ship(shipmentId);
                assertStep(product, new StockLevels(7, 0, 7));
                assertThat(inTransit(order.id())).isEqualTo(3);

                fulfilmentService.deliver(shipmentId);
                assertStep(product, new StockLevels(7, 0, 7));
                assertThat(inTransit(order.id())).isZero();
                assertThat(fixtures.order(order.id()).status()).isEqualTo(OrderStatus.DELIVERED);

                ReturnResponse returned = returnService.createReturn(order.id(), new CreateReturnRequest(List.of(
                                new CreateReturnRequest.Line(item, 1, ReturnReason.NO_LONGER_NEEDED,
                                                ItemCondition.UNOPENED),
                                new CreateReturnRequest.Line(item, 1, ReturnReason.DEFECTIVE, ItemCondition.OPENED))),
                                null)
                                .resource();
                assertThat(returned.items()).extracting(ReturnResponse.Item::disposition)
                                .containsExactly(Disposition.RESTOCK, Disposition.DISCARD);
                assertThat(returned.creditNote().amount()).isEqualByComparingTo("20.00");
                assertThat(returned.orderTotals().netTotal()).isEqualByComparingTo("10.00");
                assertStep(product, new StockLevels(8, 0, 8));
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertOrderCreditConsistent(order.id());
        }

        private void assertStep(long productId, StockLevels expected) {
                assertThat(fixtures.stock(productId)).isEqualTo(expected);
                invariants.assertInventoryConsistent(productId);
        }

        /**
         * Units shipped but not yet delivered; derived from order item counters, never
         * stored.
         */
        private int inTransit(long orderId) {
                return fixtures.order(orderId).items().stream()
                                .mapToInt(item -> item.shippedQuantity() - item.deliveredQuantity())
                                .sum();
        }
}
