package io.github.gsorak.inventory_orders_demo.fulfilment;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;

import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ShipmentListApiTest extends IntegrationTest {

    @Test
    void listsTheShipmentsOfAnOrderInPackingOrder() throws Exception {
        long product = fixtures.createProduct("2.00", 10);
        OrderResponse order = fixtures.placeOrder(Map.of(product, 5));
        long item = order.items().getFirst().id();
        long delivered = fixtures.deliver(order.id(), Map.of(item, 3));
        long packed = fixtures.pack(order.id(), Map.of(item, 2));

        mockMvc.perform(get("/api/orders/{id}/shipments", order.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(delivered))
                .andExpect(jsonPath("$[0].status").value("DELIVERED"))
                .andExpect(jsonPath("$[0].items[0].orderItemId").value(item))
                .andExpect(jsonPath("$[0].items[0].quantity").value(3))
                .andExpect(jsonPath("$[1].id").value(packed))
                .andExpect(jsonPath("$[1].status").value("PACKED"));
    }

    @Test
    void anOrderWithoutShipmentsHasAnEmptyList() throws Exception {
        OrderResponse order = fixtures.placeOrder(Map.of(fixtures.createProduct("2.00", 1), 1));

        mockMvc.perform(get("/api/orders/{id}/shipments", order.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void unknownOrderIsNotFound() throws Exception {
        mockMvc.perform(get("/api/orders/{id}/shipments", Long.MAX_VALUE))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }
}
