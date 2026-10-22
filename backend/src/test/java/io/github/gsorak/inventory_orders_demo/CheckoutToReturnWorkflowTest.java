package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/** The README workflow, end to end over HTTP. */
class CheckoutToReturnWorkflowTest extends IntegrationTest {

        @Test
        void checkoutPaymentPartialFulfilmentReturnAndReports() throws Exception {
                long lamp = id(postJson("/api/products", """
                                {"sku": "LAMP-%s", "name": "Desk lamp", "unitPrice": 39.90, "lowStockThreshold": 5}
                                """.formatted(UUID.randomUUID())).andExpect(status().isCreated()));
                long bulb = id(postJson("/api/products", """
                                {"sku": "BULB-%s", "name": "LED bulb", "unitPrice": 4.50, "lowStockThreshold": 20}
                                """.formatted(UUID.randomUUID())).andExpect(status().isCreated()));
                postJson("/api/products/" + lamp + "/stock-receipts", "{\"quantity\": 10}")
                                .andExpect(status().isCreated());
                postJson("/api/products/" + bulb + "/stock-receipts", "{\"quantity\": 30}")
                                .andExpect(status().isCreated());

                long reservationId = id(postJson("/api/reservations", """
                                {"items": [{"productId": %d, "quantity": 2}, {"productId": %d, "quantity": 5}]}
                                """.formatted(lamp, bulb)).andExpect(status().isCreated()));
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(10, 2, 8));

                String order = postJson("/api/reservations/" + reservationId + "/confirm",
                                "{\"paymentReference\": \"PAY-%s\"}".formatted(UUID.randomUUID()))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.grossTotal").value(102.30))
                                .andReturn().getResponse().getContentAsString();
                long orderId = ((Number) JsonPath.read(order, "$.id")).longValue();
                long lampItem = itemId(order, lamp);
                long bulbItem = itemId(order, bulb);

                long firstShipment = id(postJson("/api/orders/" + orderId + "/shipments", """
                                {"items": [{"orderItemId": %d, "quantity": 2}, {"orderItemId": %d, "quantity": 3}]}
                                """.formatted(lampItem, bulbItem)).andExpect(status().isCreated()));
                postJson("/api/shipments/" + firstShipment + "/ship", "").andExpect(status().isOk());
                postJson("/api/shipments/" + firstShipment + "/deliver", "").andExpect(status().isOk());
                long secondShipment = id(postJson("/api/orders/" + orderId + "/shipments", """
                                {"items": [{"orderItemId": %d, "quantity": 2}]}
                                """.formatted(bulbItem)).andExpect(status().isCreated()));
                postJson("/api/shipments/" + secondShipment + "/ship", "").andExpect(status().isOk());
                postJson("/api/shipments/" + secondShipment + "/deliver", "").andExpect(status().isOk());

                mockMvc.perform(get("/api/orders/" + orderId)).andExpect(jsonPath("$.status").value("DELIVERED"));
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(8, 0, 8));

                postJson("/api/orders/" + orderId + "/returns",
                                """
                                                {"items": [
                                                  {"orderItemId": %d, "quantity": 1, "reason": "NO_LONGER_NEEDED", "condition": "UNOPENED"},
                                                  {"orderItemId": %d, "quantity": 2, "reason": "DAMAGED_IN_TRANSIT", "condition": "DAMAGED"}
                                                ]}"""
                                                .formatted(lampItem, bulbItem))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.creditNote.amount").value(48.90))
                                .andExpect(jsonPath("$.orderTotals.netTotal").value(53.40));
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(9, 0, 9));
                assertThat(fixtures.stock(bulb)).isEqualTo(new StockLevels(25, 0, 25));

                mockMvc.perform(get("/api/reports/low-stock")).andExpect(status().isOk());
                mockMvc.perform(get("/api/reports/inventory-aging")).andExpect(status().isOk());
                mockMvc.perform(get("/api/reports/order-cycle-time")).andExpect(status().isOk());

                invariants.assertInventoryConsistent(lamp);
                invariants.assertInventoryConsistent(bulb);
                invariants.assertOrderItemsConsistent(orderId);
                invariants.assertOrderCreditConsistent(orderId);
        }

        private ResultActions postJson(String path, String body) throws Exception {
                return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
        }

        private static long id(ResultActions result) throws Exception {
                return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id"))
                                .longValue();
        }

        private static long itemId(String orderJson, long productId) {
                List<Number> ids = JsonPath.read(orderJson, "$.items[?(@.productId == %d)].id".formatted(productId));
                return ids.getFirst().longValue();
        }
}
