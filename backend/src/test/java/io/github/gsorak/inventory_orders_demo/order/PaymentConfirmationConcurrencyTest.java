package io.github.gsorak.inventory_orders_demo.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationExpirySweeper;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationService;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.Concurrently.Outcome;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class PaymentConfirmationConcurrencyTest extends IntegrationTest {

        @Autowired
        OrderService orderService;

        @Autowired
        ReservationService reservationService;

        @Autowired
        OrderRepository orderRepository;

        @Autowired
        ReservationExpirySweeper sweeper;

        /**
         * Either payment wins (stock stays reserved for the order) or cancellation wins
         * (stock released once).
         */
        @RepeatedTest(5)
        void confirmationRacingCancellationHasExactlyOneWinner() {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 3);
                String paymentReference = "PAY-race-" + reservationId;

                List<Outcome<Object>> outcomes = Concurrently.run(10, i -> i % 2 == 0
                                ? orderService.confirmPayment(reservationId, paymentReference)
                                : reservationService.cancel(reservationId));

                boolean confirmed = orderRepository.findByReservationId(reservationId).isPresent();
                long failures = outcomes.stream().filter(outcome -> !outcome.succeeded()).count();
                assertThat(failures).isEqualTo(5);
                assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                                                && e.code() == ErrorCode.INVALID_STATE_TRANSITION);
                assertThat(fixtures.stock(product))
                                .isEqualTo(confirmed ? new StockLevels(5, 3, 2) : new StockLevels(5, 0, 5));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void confirmationsRacingTheSweeperAfterExpiryAllFailAndStockIsReleasedOnce() {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 3);
                clock.advance(Duration.ofMinutes(16));

                List<Outcome<Object>> outcomes = Concurrently.run(8, i -> i % 2 == 0
                                ? orderService.confirmPayment(reservationId, "PAY-expired-" + reservationId)
                                : sweeper.expireDueReservations());

                assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                                .hasSize(4)
                                .allMatch(outcome -> outcome.error() instanceof BusinessException e
                                                && e.code() == ErrorCode.RESERVATION_EXPIRED);
                assertThat(orderRepository.findByReservationId(reservationId)).isEmpty();
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
                invariants.assertInventoryConsistent(product);
        }
}
