package io.github.gsorak.inventory_orders_demo.fulfilment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import io.github.gsorak.inventory_orders_demo.order.OrderStatus;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class FulfilmentApiTest extends IntegrationTest {

        @Test
        void orderIsFulfilledPartiallyAcrossTwoShipments() throws Exception {
                long lamp = fixtures.createProduct("20.00", 10);
                long bulb = fixtures.createProduct("2.50", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(lamp, 3, bulb, 4));
                long lampItem = itemId(order, lamp);
                long bulbItem = itemId(order, bulb);

                long first = shipmentId(pack(order.id(), null, lines(lampItem, 2, bulbItem, 4))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.status").value("PACKED"))
                                .andExpect(jsonPath("$.items.length()").value(2)));
                assertThat(fixtures.order(order.id()).status()).isEqualTo(OrderStatus.IN_FULFILMENT);
                assertThat(fixtures.stock(lamp)).as("packing does not touch inventory")
                                .isEqualTo(new StockLevels(10, 3, 7));

                mockMvc.perform(post("/api/shipments/{id}/ship", first))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.status").value("SHIPPED"))
                                .andExpect(jsonPath("$.shippedAt").exists());
                assertThat(fixtures.stock(lamp)).as("shipping keeps availability").isEqualTo(new StockLevels(8, 1, 7));
                assertThat(fixtures.stock(bulb)).isEqualTo(new StockLevels(6, 0, 6));

                mockMvc.perform(post("/api/shipments/{id}/deliver", first))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.status").value("DELIVERED"));
                OrderResponse partiallyDelivered = fixtures.order(order.id());
                assertThat(partiallyDelivered.status()).isEqualTo(OrderStatus.IN_FULFILMENT);
                assertThat(partiallyDelivered.deliveredAt()).isNull();

                long second = shipmentId(pack(order.id(), null, lines(lampItem, 1)).andExpect(status().isCreated()));
                mockMvc.perform(post("/api/shipments/{id}/ship", second)).andExpect(status().isOk());
                mockMvc.perform(post("/api/shipments/{id}/deliver", second)).andExpect(status().isOk());

                mockMvc.perform(get("/api/orders/{id}", order.id()))
                                .andExpect(jsonPath("$.status").value("DELIVERED"))
                                .andExpect(jsonPath("$.deliveredAt").value(clock.instant().toString()))
                                .andExpect(jsonPath("$.items[?(@.id == %d)].deliveredQuantity".formatted(lampItem))
                                                .value(3));
                assertThat(fixtures.stock(lamp)).isEqualTo(new StockLevels(7, 0, 7));
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertInventoryConsistent(lamp);
                invariants.assertInventoryConsistent(bulb);
        }

        @Test
        void packingMoreThanTheUnpackedQuantityIsRejectedAtomically() throws Exception {
                long lamp = fixtures.createProduct("20.00", 10);
                long bulb = fixtures.createProduct("2.50", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(lamp, 3, bulb, 4));
                fixtures.pack(order.id(), Map.of(itemId(order, lamp), 2));

                pack(order.id(), null, lines(itemId(order, bulb), 1, itemId(order, lamp), 2))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("QUANTITY_EXCEEDED"));

                OrderResponse unchanged = fixtures.order(order.id());
                assertThat(unchanged.items()).extracting(OrderResponse.Item::packedQuantity)
                                .containsExactlyInAnyOrder(2, 0);
                invariants.assertOrderItemsConsistent(order.id());
        }

        @Test
        void shipmentStatesCannotBeSkippedOrReversed() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 2));
                long shipmentId = fixtures.pack(order.id(), Map.of(itemId(order, product), 2));

                mockMvc.perform(post("/api/shipments/{id}/deliver", shipmentId))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));

                mockMvc.perform(post("/api/shipments/{id}/ship", shipmentId)).andExpect(status().isOk());
                mockMvc.perform(post("/api/shipments/{id}/deliver", shipmentId)).andExpect(status().isOk());
                mockMvc.perform(post("/api/shipments/{id}/ship", shipmentId))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));
        }

        @Test
        void repeatedShipAndDeliverRequestsChangeNothing() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 3));
                long shipmentId = fixtures.pack(order.id(), Map.of(itemId(order, product), 3));

                mockMvc.perform(post("/api/shipments/{id}/ship", shipmentId)).andExpect(status().isOk());
                mockMvc.perform(post("/api/shipments/{id}/ship", shipmentId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.status").value("SHIPPED"));
                assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(7, 0, 7));

                mockMvc.perform(post("/api/shipments/{id}/deliver", shipmentId)).andExpect(status().isOk());
                mockMvc.perform(post("/api/shipments/{id}/deliver", shipmentId)).andExpect(status().isOk());
                assertThat(fixtures.order(order.id()).items().getFirst().deliveredQuantity()).isEqualTo(3);
                invariants.assertOrderItemsConsistent(order.id());
                invariants.assertInventoryConsistent(product);
        }

        @Test
        void shipmentIdempotencyKeyReplaysOrRejects() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 5));
                OrderResponse otherOrder = fixtures.placeOrder(Map.of(product, 5));
                long item = itemId(order, product);
                String key = UUID.randomUUID().toString();

                long shipmentId = shipmentId(pack(order.id(), key, lines(item, 2)).andExpect(status().isCreated()));
                pack(order.id(), key, lines(item, 2))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id").value(shipmentId));
                pack(order.id(), key, lines(item, 3))
                                .andExpect(status().isUnprocessableContent())
                                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
                pack(otherOrder.id(), key, lines(itemId(otherOrder, product), 2))
                                .andExpect(status().isUnprocessableContent());

                assertThat(fixtures.order(order.id()).items().getFirst().packedQuantity()).isEqualTo(2);
        }

        @Test
        void invalidShipmentRequestsAreRejected() throws Exception {
                long product = fixtures.createProduct("1.00", 10);
                OrderResponse order = fixtures.placeOrder(Map.of(product, 2));
                OrderResponse otherOrder = fixtures.placeOrder(Map.of(product, 2));
                long item = itemId(order, product);

                pack(order.id(), null, lines(itemId(otherOrder, product), 1))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
                pack(order.id(), null,
                                "{\"items\": [{\"orderItemId\": %d, \"quantity\": 1}, {\"orderItemId\": %d, \"quantity\": 1}]}"
                                                .formatted(item, item))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
                pack(order.id(), null, lines(item, 0))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
                pack(Long.MAX_VALUE, null, lines(item, 1)).andExpect(status().isNotFound());
                mockMvc.perform(post("/api/shipments/{id}/ship", Long.MAX_VALUE)).andExpect(status().isNotFound());
                mockMvc.perform(get("/api/shipments/{id}", Long.MAX_VALUE)).andExpect(status().isNotFound());
        }

        static long itemId(OrderResponse order, long productId) {
                return order.items().stream().filter(item -> item.productId() == productId).findFirst().orElseThrow()
                                .id();
        }

        private ResultActions pack(long orderId, String idempotencyKey, String body) throws Exception {
                var request = post("/api/orders/{id}/shipments", orderId).contentType(MediaType.APPLICATION_JSON)
                                .content(body);
                if (idempotencyKey != null) {
                        request.header("Idempotency-Key", idempotencyKey);
                }
                return mockMvc.perform(request);
        }

        private static long shipmentId(ResultActions result) throws Exception {
                return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id"))
                                .longValue();
        }

        private static String lines(long orderItemId, int quantity) {
                return "{\"items\": [{\"orderItemId\": %d, \"quantity\": %d}]}".formatted(orderItemId, quantity);
        }

        private static String lines(long firstItemId, int firstQuantity, long secondItemId, int secondQuantity) {
                return "{\"items\": [{\"orderItemId\": %d, \"quantity\": %d}, {\"orderItemId\": %d, \"quantity\": %d}]}"
                                .formatted(firstItemId, firstQuantity, secondItemId, secondQuantity);
        }
}
