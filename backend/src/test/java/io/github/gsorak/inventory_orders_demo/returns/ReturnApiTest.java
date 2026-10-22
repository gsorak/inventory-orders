package io.github.gsorak.inventory_orders_demo.returns;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ReturnApiTest extends IntegrationTest {

        @Test
        void partialReturnRestocksResellableUnitsDiscardsTheRestAndCreditsTheOrder() throws Exception {
                long lamp = fixtures.createProduct("19.99", 10);
                long bulb = fixtures.createProduct("2.50", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(lamp, 3, bulb, 4));
                long lampItem = itemId(order, lamp);
                long bulbItem = itemId(order, bulb);
                fixtures.deliver(order.id(), Map.of(lampItem, 3, bulbItem, 4));
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(7, 0, 7));

                String body = """
                                {"items": [
                                  {"orderItemId": %d, "quantity": 1, "reason": "NO_LONGER_NEEDED", "condition": "UNOPENED"},
                                  {"orderItemId": %d, "quantity": 1, "reason": "DEFECTIVE", "condition": "OPENED"},
                                  {"orderItemId": %d, "quantity": 3, "reason": "WRONG_ITEM_SENT", "condition": "UNOPENED"}
                                ]}"""
                                .formatted(lampItem, lampItem, bulbItem);
                createReturn(order.id(), null, body)
                                .andExpect(status().isCreated())
                                .andExpect(header().exists("Location"))
                                .andExpect(jsonPath("$.items[0].disposition").value("RESTOCK"))
                                .andExpect(jsonPath("$.items[0].refundAmount").value(19.99))
                                .andExpect(jsonPath("$.items[1].disposition").value("DISCARD"))
                                .andExpect(jsonPath("$.items[2].disposition").value("RESTOCK"))
                                .andExpect(jsonPath("$.items[2].refundAmount").value(7.50))
                                .andExpect(jsonPath("$.creditNote.number")
                                                .value(org.hamcrest.Matchers.startsWith("CN-")))
                                .andExpect(jsonPath("$.creditNote.amount").value(47.48))
                                .andExpect(jsonPath("$.orderTotals.grossTotal").value(69.97))
                                .andExpect(jsonPath("$.orderTotals.creditedTotal").value(47.48))
                                .andExpect(jsonPath("$.orderTotals.netTotal").value(22.49));

                assertThat(fixtures.stock(lamp)).as("one lamp restocked, one discarded")
                                .isEqualTo(new StockLevels(8, 0, 8));
                assertThat(fixtures.stock(bulb)).isEqualTo(new StockLevels(9, 0, 9));
                mockMvc.perform(get("/api/orders/{id}", order.id()))
                                .andExpect(jsonPath("$.status").value("DELIVERED"))
                                .andExpect(jsonPath("$.netTotal").value(22.49))
                                .andExpect(jsonPath("$.items[?(@.id == %d)].returnedQuantity".formatted(lampItem))
                                                .value(2));
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertOrderCreditConsistent(order.id());
                invariants.assertInventoryConsistent(lamp);
                invariants.assertInventoryConsistent(bulb);
        }

        @Test
        void onlyDeliveredUnitsThatWereNotYetReturnedCanBeReturned() throws Exception {
                long product = fixtures.createProduct("10.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 3));
                long item = itemId(order, product);
                fixtures.deliver(order.id(), Map.of(item, 2));
                fixtures.pack(order.id(), Map.of(item, 1));

                createReturn(order.id(), null, line(item, 3, "NO_LONGER_NEEDED", "UNOPENED"))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("QUANTITY_EXCEEDED"));

                createReturn(order.id(), null, line(item, 2, "NO_LONGER_NEEDED", "UNOPENED"))
                                .andExpect(status().isCreated());
                createReturn(order.id(), null, line(item, 1, "NO_LONGER_NEEDED", "UNOPENED"))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("QUANTITY_EXCEEDED"));

                assertThat(fixtures.order(order.id()).creditedTotal()).isEqualByComparingTo("20.00");
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertOrderCreditConsistent(order.id());
        }

        @Test
        void returnIdempotencyKeyPreventsADuplicateRefund() throws Exception {
                long product = fixtures.createProduct("10.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 4));
                long item = itemId(order, product);
                fixtures.deliver(order.id(), Map.of(item, 4));
                String key = UUID.randomUUID().toString();
                String body = line(item, 1, "NO_LONGER_NEEDED", "UNOPENED");

                String created = createReturn(order.id(), key, body).andExpect(status().isCreated())
                                .andReturn().getResponse().getContentAsString();
                int returnId = JsonPath.read(created, "$.id");
                createReturn(order.id(), key, body)
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(returnId));
                createReturn(order.id(), key, line(item, 1, "DEFECTIVE", "UNOPENED"))
                                .andExpect(status().isUnprocessableContent())
                                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));

                assertThat(fixtures.order(order.id()).creditedTotal()).isEqualByComparingTo("10.00");
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(7, 0, 7));
                mockMvc.perform(get("/api/returns/{id}", returnId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.creditNote.amount").value(10.00));
        }

        @Test
        void invalidReturnRequestsAreRejected() throws Exception {
                long product = fixtures.createProduct("10.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 1));
                long item = itemId(order, product);

                createReturn(order.id(), null, line(item, 1, "NO_LONGER_NEEDED", "UNOPENED"))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("QUANTITY_EXCEEDED"));
                createReturn(order.id(), null, line(item, 1, "CHANGED_MY_MIND", "UNOPENED"))
                                .andExpect(status().isBadRequest());
                createReturn(order.id(), null, "{\"items\": [{\"orderItemId\": %d, \"quantity\": 1}]}".formatted(item))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
                createReturn(Long.MAX_VALUE, null, line(item, 1, "NO_LONGER_NEEDED", "UNOPENED"))
                                .andExpect(status().isNotFound());
                mockMvc.perform(get("/api/returns/{id}", Long.MAX_VALUE)).andExpect(status().isNotFound());
        }

        static long itemId(OrderResponse order, long productId) {
                return order.items().stream().filter(item -> item.productId() == productId).findFirst().orElseThrow()
                                .id();
        }

        private ResultActions createReturn(long orderId, String idempotencyKey, String body) throws Exception {
                var request = post("/api/orders/{id}/returns", orderId).contentType(MediaType.APPLICATION_JSON)
                                .content(body);
                if (idempotencyKey != null) {
                        request.header("Idempotency-Key", idempotencyKey);
                }
                return mockMvc.perform(request);
        }

        private static String line(long orderItemId, int quantity, String reason, String condition) {
                return """
                                {"items": [{"orderItemId": %d, "quantity": %d, "reason": "%s", "condition": "%s"}]}
                                """.formatted(orderItemId, quantity, reason, condition);
        }
}
