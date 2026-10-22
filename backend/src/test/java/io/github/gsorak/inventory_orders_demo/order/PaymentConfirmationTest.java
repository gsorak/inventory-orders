package io.github.gsorak.inventory_orders_demo.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationExpirySweeper;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class PaymentConfirmationTest extends IntegrationTest {

        @Autowired
        ReservationExpirySweeper sweeper;

        @Test
        void confirmingPaymentCreatesTheOrderAndKeepsStockReserved() throws Exception {
                long lamp = fixtures.createProduct("20.00", 10);
                long bulb = fixtures.createProduct("2.50", 10);
                Map<Long, Integer> lines = new LinkedHashMap<>();
                lines.put(lamp, 2);
                lines.put(bulb, 4);
                long reservationId = fixtures.reserve(lines);

                confirm(reservationId, "PAY-" + reservationId)
                                .andExpect(status().isCreated())
                                .andExpect(header().exists("Location"))
                                .andExpect(jsonPath("$.reservationId").value(reservationId))
                                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                                .andExpect(jsonPath("$.grossTotal").value(50.00))
                                .andExpect(jsonPath("$.creditedTotal").value(0))
                                .andExpect(jsonPath("$.netTotal").value(50.00))
                                .andExpect(jsonPath("$.items[0].quantity").value(2))
                                .andExpect(jsonPath("$.items[0].packedQuantity").value(0));

                mockMvc.perform(get("/api/reservations/{id}", reservationId))
                                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                                .andExpect(jsonPath("$.stockReleasedAt").doesNotExist());
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(10, 2, 8));
                assertThat(fixtures.stock(bulb)).isEqualTo(new StockLevels(10, 4, 6));
                invariants.assertInventoryConsistent(lamp);
                invariants.assertInventoryConsistent(bulb);
        }

        @Test
        void repeatingTheConfirmationReturnsTheSameOrder() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 2);
                String paymentReference = "PAY-repeat-" + reservationId;

                String body = confirm(reservationId, paymentReference).andExpect(status().isCreated())
                                .andReturn().getResponse().getContentAsString();
                int orderId = JsonPath.read(body, "$.id");

                confirm(reservationId, paymentReference)
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(orderId));
                confirm(reservationId, "PAY-other-" + reservationId)
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 2, 3));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void paymentReferenceCannotBeUsedForTwoOrders() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long first = fixtures.reserve(product, 1);
                long second = fixtures.reserve(product, 1);
                String paymentReference = "PAY-shared-" + first;

                confirm(first, paymentReference).andExpect(status().isCreated());
                confirm(second, paymentReference)
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
                mockMvc.perform(get("/api/reservations/{id}", second)).andExpect(jsonPath("$.status").value("ACTIVE"));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void logicallyExpiredReservationCannotBeConfirmedAndIsReleasedBySweeper() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 2);
                clock.advance(Duration.ofMinutes(15));

                confirm(reservationId, "PAY-late-" + reservationId)
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("RESERVATION_EXPIRED"));
                assertThat(fixtures.stock(product).reserved()).isEqualTo(2);
                invariants.assertInventoryConsistent(product);

                sweeper.expireDueReservations();
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
                invariants.assertInventoryConsistent(product);
                confirm(reservationId, "PAY-late-" + reservationId)
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("RESERVATION_EXPIRED"));
        }

        @Test
        void cancelledReservationCannotBeConfirmedAndConfirmedOneCannotBeCancelled() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long cancelled = fixtures.reserve(product, 1);
                mockMvc.perform(post("/api/reservations/{id}/cancel", cancelled)).andExpect(status().isOk());
                confirm(cancelled, "PAY-cancelled-" + cancelled)
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));

                long confirmed = fixtures.reserve(product, 2);
                fixtures.confirm(confirmed);
                mockMvc.perform(post("/api/reservations/{id}/cancel", confirmed))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 2, 3));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void sweeperNeverReleasesStockOfConfirmedReservations() {
                long product = fixtures.createProduct("1.00", 5);
                fixtures.confirm(fixtures.reserve(product, 2));

                clock.advance(Duration.ofHours(1));
                sweeper.expireDueReservations();

                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 2, 3));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void reservationLeadsDirectlyToItsOrder() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 2);

                mockMvc.perform(get("/api/reservations/{id}/order", reservationId))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                                .andExpect(jsonPath("$.detail")
                                                .value("Reservation %d has no order".formatted(reservationId)));

                String body = confirm(reservationId, "PAY-lookup-" + reservationId).andExpect(status().isCreated())
                                .andReturn().getResponse().getContentAsString();
                int orderId = JsonPath.read(body, "$.id");

                // Recovering after a lost confirmation response: the lookup and a replay both
                // find the one order.
                mockMvc.perform(get("/api/reservations/{id}/order", reservationId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(orderId))
                                .andExpect(jsonPath("$.reservationId").value(reservationId))
                                .andExpect(jsonPath("$.paymentReference").value("PAY-lookup-" + reservationId));
                confirm(reservationId, "PAY-lookup-" + reservationId)
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(orderId));

                mockMvc.perform(get("/api/reservations/{id}/order", Long.MAX_VALUE))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.detail")
                                                .value("Reservation %d not found".formatted(Long.MAX_VALUE)));
        }

        @Test
        void invalidConfirmationRequestsAreRejected() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 1);

                confirm(reservationId, "  ")
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
                confirm(Long.MAX_VALUE, "PAY-unknown").andExpect(status().isNotFound());
                mockMvc.perform(get("/api/orders/{id}", Long.MAX_VALUE)).andExpect(status().isNotFound());
        }

        private ResultActions confirm(long reservationId, String paymentReference) throws Exception {
                return mockMvc.perform(post("/api/reservations/{id}/confirm", reservationId)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"paymentReference\": \"%s\"}".formatted(paymentReference)));
        }
}
