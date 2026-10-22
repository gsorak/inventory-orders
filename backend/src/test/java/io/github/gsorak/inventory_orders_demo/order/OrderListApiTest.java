package io.github.gsorak.inventory_orders_demo.order;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class OrderListApiTest extends IntegrationTest {

    @Test
    void listsOrdersNewestFirstOnePageAtATime() throws Exception {
        long product = fixtures.createProduct("4.00", 10);
        OrderResponse older = fixtures.placeOrder(Map.of(product, 1));
        OrderResponse newer = fixtures.placeOrder(Map.of(product, 2));

        mockMvc.perform(get("/api/orders").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(newer.id()))
                .andExpect(jsonPath("$.items[0].reservationId").value(newer.reservationId()))
                .andExpect(jsonPath("$.items[0].status").value("CONFIRMED"))
                .andExpect(jsonPath("$.items[0].grossTotal").value(8.00))
                .andExpect(jsonPath("$.items[0].items[0].quantity").value(2));

        mockMvc.perform(get("/api/orders").param("page", "1").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(older.id()));
    }

    @Test
    void invalidPageSizeIsRejected() throws Exception {
        mockMvc.perform(get("/api/orders").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"));
    }
}
