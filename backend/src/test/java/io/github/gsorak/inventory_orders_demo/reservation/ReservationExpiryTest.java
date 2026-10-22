package io.github.gsorak.inventory_orders_demo.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Logical expiry (time has passed) versus physical release (the sweeper
 * returned the stock).
 */
class ReservationExpiryTest extends IntegrationTest {

    private static final Duration PAST_TTL = Duration.ofMinutes(15).plusSeconds(1);

    @Autowired
    ReservationExpirySweeper sweeper;

    @Test
    void logicallyExpiredReservationKeepsItsStockUntilTheSweeperReleasesIt() throws Exception {
        long product = fixtures.createProduct("1.00", 5);
        long reservationId = fixtures.reserve(product, 3);

        clock.advance(PAST_TTL);

        // Logically expired: reported as EXPIRED and no longer cancellable, but the
        // stock is still held.
        mockMvc.perform(get("/api/reservations/{id}", reservationId))
                .andExpect(jsonPath("$.status").value("EXPIRED"))
                .andExpect(jsonPath("$.stockReleasedAt").doesNotExist());
        mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESERVATION_EXPIRED"));
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 3, 2));
        // Still consistent: the reservation's persisted status is ACTIVE, so it still
        // accounts for the reserved units.
        invariants.assertInventoryConsistent(product);

        assertThat(sweeper.expireDueReservations()).isPositive();

        mockMvc.perform(get("/api/reservations/{id}", reservationId))
                .andExpect(jsonPath("$.status").value("EXPIRED"))
                .andExpect(jsonPath("$.stockReleasedAt").value(clock.instant().toString()));
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
        invariants.assertInventoryConsistent(product);

        sweeper.expireDueReservations();
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void sweeperLeavesUnexpiredReservationsAlone() {
        long product = fixtures.createProduct("1.00", 5);
        fixtures.reserve(product, 2);

        clock.advance(Duration.ofMinutes(14));
        sweeper.expireDueReservations();

        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 2, 3));
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void sweeperDoesNotReleaseCancelledReservationsAgain() throws Exception {
        long product = fixtures.createProduct("1.00", 5);
        long reservationId = fixtures.reserve(product, 2);
        mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId)).andExpect(status().isOk());

        clock.advance(PAST_TTL);
        sweeper.expireDueReservations();

        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
        invariants.assertInventoryConsistent(product);
        mockMvc.perform(get("/api/reservations/{id}", reservationId))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void concurrentSweepsReleaseStockExactlyOnce() {
        long product = fixtures.createProduct("1.00", 10);
        for (int i = 0; i < 5; i++) {
            fixtures.reserve(product, 2);
        }
        clock.advance(PAST_TTL);

        var outcomes = Concurrently.run(4, i -> sweeper.expireDueReservations());

        assertThat(outcomes).allMatch(Concurrently.Outcome::succeeded);
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(10, 0, 10));
        invariants.assertInventoryConsistent(product);
    }
}
