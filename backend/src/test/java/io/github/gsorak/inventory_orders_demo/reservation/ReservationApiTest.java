package io.github.gsorak.inventory_orders_demo.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ReservationApiTest extends IntegrationTest {

        @Test
        void reservationHoldsStockUntilExpiry() throws Exception {
                long lamp = fixtures.createProduct("20.00", 10);
                long bulb = fixtures.createProduct("2.50", 10);

                reserve(null, """
                                {"items": [{"productId": %d, "quantity": 2}, {"productId": %d, "quantity": 4}]}
                                """.formatted(lamp, bulb))
                                .andExpect(status().isCreated())
                                .andExpect(header().exists("Location"))
                                .andExpect(jsonPath("$.status").value("ACTIVE"))
                                .andExpect(jsonPath("$.expiresAt")
                                                .value(clock.instant().plusSeconds(15 * 60).toString()))
                                .andExpect(jsonPath("$.stockReleasedAt").doesNotExist())
                                .andExpect(jsonPath("$.total").value(50.00))
                                .andExpect(jsonPath("$.items.length()").value(2));

                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(10, 2, 8));
                assertThat(fixtures.stock(bulb)).isEqualTo(new StockLevels(10, 4, 6));
                invariants.assertInventoryConsistent(lamp);
                invariants.assertInventoryConsistent(bulb);
        }

        @Test
        void insufficientStockRejectsTheWholeReservation() throws Exception {
                long plenty = fixtures.createProduct("1.00", 10);
                long scarce = fixtures.createProduct("1.00", 1);

                reserve(null, """
                                {"items": [{"productId": %d, "quantity": 5}, {"productId": %d, "quantity": 2}]}
                                """.formatted(plenty, scarce))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"))
                                .andExpect(jsonPath("$.productId").value(scarce))
                                .andExpect(jsonPath("$.requested").value(2))
                                .andExpect(jsonPath("$.available").value(1));

                assertThat(fixtures.stock(plenty)).isEqualTo(new StockLevels(10, 0, 10));
                assertThat(fixtures.stock(scarce)).isEqualTo(new StockLevels(1, 0, 1));
                invariants.assertInventoryConsistent(plenty);
                invariants.assertInventoryConsistent(scarce);
        }

        @Test
        void unknownProductRejectsTheWholeReservation() throws Exception {
                long known = fixtures.createProduct("1.00", 5);

                reserve(null, """
                                {"items": [{"productId": %d, "quantity": 1}, {"productId": %d, "quantity": 1}]}
                                """.formatted(known, Long.MAX_VALUE))
                                .andExpect(status().isNotFound());

                assertThat(fixtures.stock(known).reserved()).isZero();
                invariants.assertInventoryConsistent(known);
        }

        @Test
        void invalidReservationRequestsAreRejected() throws Exception {
                long product = fixtures.createProduct("1.00", 5);

                reserve(null, "{\"items\": []}")
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
                reserve(null, "{\"items\": [{\"productId\": %d, \"quantity\": 0}]}".formatted(product))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
                reserve(null, """
                                {"items": [{"productId": %d, "quantity": 1}, {"productId": %d, "quantity": 2}]}
                                """.formatted(product, product))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }

        @Test
        void cancellingReleasesStockExactlyOnce() throws Exception {
                long product = fixtures.createProduct("1.00", 5);
                long reservationId = fixtures.reserve(product, 3);

                mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.status").value("CANCELLED"))
                                .andExpect(jsonPath("$.stockReleasedAt").exists());
                mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.status").value("CANCELLED"));

                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void unknownReservationIsNotFound() throws Exception {
                mockMvc.perform(get("/api/reservations/{id}", Long.MAX_VALUE)).andExpect(status().isNotFound());
                mockMvc.perform(post("/api/reservations/{id}/cancel", Long.MAX_VALUE)).andExpect(status().isNotFound());
        }

        @Test
        void replayingTheSameIdempotencyKeyReturnsTheOriginalReservation() throws Exception {
                long first = fixtures.createProduct("1.00", 10);
                long second = fixtures.createProduct("1.00", 10);
                String key = UUID.randomUUID().toString();

                String created = reserve(key, """
                                {"items": [{"productId": %d, "quantity": 2}, {"productId": %d, "quantity": 1}]}
                                """.formatted(first, second))
                                .andExpect(status().isCreated())
                                .andReturn().getResponse().getContentAsString();
                int reservationId = JsonPath.read(created, "$.id");

                // Same lines in a different order are the same request.
                reserve(key, """
                                {"items": [{"productId": %d, "quantity": 1}, {"productId": %d, "quantity": 2}]}
                                """.formatted(second, first))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(reservationId));

                assertThat(fixtures.stock(first).reserved()).isEqualTo(2);
                assertThat(fixtures.stock(second).reserved()).isEqualTo(1);
                invariants.assertInventoryConsistent(first);
                invariants.assertInventoryConsistent(second);
        }

        @Test
        void reusingAnIdempotencyKeyForADifferentRequestIsRejected() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                String key = UUID.randomUUID().toString();

                reserve(key, "{\"items\": [{\"productId\": %d, \"quantity\": 2}]}".formatted(product))
                                .andExpect(status().isCreated());
                reserve(key, "{\"items\": [{\"productId\": %d, \"quantity\": 3}]}".formatted(product))
                                .andExpect(status().isUnprocessableContent())
                                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));

                assertThat(fixtures.stock(product).reserved()).isEqualTo(2);
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void overlongIdempotencyKeyIsRejected() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                reserve("k".repeat(101), "{\"items\": [{\"productId\": %d, \"quantity\": 1}]}".formatted(product))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }

        private ResultActions reserve(String idempotencyKey, String body) throws Exception {
                var request = post("/api/reservations").contentType(MediaType.APPLICATION_JSON).content(body);
                if (idempotencyKey != null) {
                        request.header("Idempotency-Key", idempotencyKey);
                }
                return mockMvc.perform(request);
        }
}
