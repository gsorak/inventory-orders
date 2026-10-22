package io.github.gsorak.inventory_orders_demo.returns;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ReturnListApiTest extends IntegrationTest {

    @Test
    void listsTheReturnsOfAnOrderWithTheirCreditNotes() throws Exception {
        long product = fixtures.createProduct("5.00", 10);
        OrderResponse order = fixtures.placeOrder(Map.of(product, 3));
        long item = order.items().getFirst().id();
        fixtures.deliver(order.id(), Map.of(item, 3));
        returnOne(order.id(), item, "NO_LONGER_NEEDED", "UNOPENED");
        returnOne(order.id(), item, "DEFECTIVE", "OPENED");

        mockMvc.perform(get("/api/orders/{id}/returns", order.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].orderId").value(order.id()))
                .andExpect(jsonPath("$[0].items[0].disposition").value("RESTOCK"))
                .andExpect(jsonPath("$[0].creditNote.number").value(startsWith("CN-")))
                .andExpect(jsonPath("$[0].creditNote.amount").value(5.00))
                .andExpect(jsonPath("$[1].items[0].disposition").value("DISCARD"))
                .andExpect(jsonPath("$[1].orderTotals.creditedTotal").value(10.00))
                .andExpect(jsonPath("$[1].orderTotals.netTotal").value(5.00));
    }

    @Test
    void anOrderWithoutReturnsHasAnEmptyList() throws Exception {
        OrderResponse order = fixtures.placeOrder(Map.of(fixtures.createProduct("2.00", 1), 1));

        mockMvc.perform(get("/api/orders/{id}/returns", order.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void unknownOrderIsNotFound() throws Exception {
        mockMvc.perform(get("/api/orders/{id}/returns", Long.MAX_VALUE))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    private void returnOne(long orderId, long orderItemId, String reason, String condition) throws Exception {
        mockMvc.perform(post("/api/orders/{id}/returns", orderId).contentType(MediaType.APPLICATION_JSON).content("""
                {"items": [{"orderItemId": %d, "quantity": 1, "reason": "%s", "condition": "%s"}]}"""
                .formatted(orderItemId, reason, condition)))
                .andExpect(status().isCreated());
    }
}
