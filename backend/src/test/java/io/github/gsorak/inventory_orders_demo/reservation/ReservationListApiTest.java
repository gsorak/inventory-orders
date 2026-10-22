package io.github.gsorak.inventory_orders_demo.reservation;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ReservationListApiTest extends IntegrationTest {

    @Autowired
    ReservationService reservationService;

    @Test
    void listsReservationsNewestFirstOnePageAtATime() throws Exception {
        long product = fixtures.createProduct("3.00", 10);
        long first = fixtures.reserve(product, 1);
        long second = fixtures.reserve(product, 2);
        long third = fixtures.reserve(product, 3);
        reservationService.cancel(second);

        mockMvc.perform(get("/api/reservations").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].id").value(third))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].items[0].productId").value(product))
                .andExpect(jsonPath("$.items[0].items[0].quantity").value(3))
                .andExpect(jsonPath("$.items[1].id").value(second))
                .andExpect(jsonPath("$.items[1].status").value("CANCELLED"))
                .andExpect(jsonPath("$.totalElements").value(greaterThanOrEqualTo(3)))
                .andExpect(jsonPath("$.totalPages").value(greaterThanOrEqualTo(2)));

        mockMvc.perform(get("/api/reservations").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.items[0].id").value(first));
    }

    @Test
    void defaultsToTheFirstPageOfTwenty() throws Exception {
        fixtures.reserve(fixtures.createProduct("1.00", 1), 1);

        mockMvc.perform(get("/api/reservations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20));
    }

    @Test
    void aPageBeyondTheLastIsEmpty() throws Exception {
        mockMvc.perform(get("/api/reservations").param("page", "1000000").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void invalidPagingParametersAreRejectedWithFieldErrors() throws Exception {
        mockMvc.perform(get("/api/reservations").param("page", "-1").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.length()").value(2))
                .andExpect(jsonPath("$.errors[*].field").value(containsInAnyOrder("page", "size")));

        mockMvc.perform(get("/api/reservations").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
