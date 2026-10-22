package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.time.Instant;
import java.util.List;

public record ShipmentResponse(
                Long id,
                Long orderId,
                ShipmentStatus status,
                Instant packedAt,
                Instant shippedAt,
                Instant deliveredAt,
                List<Item> items) {

        public record Item(Long orderItemId, Long productId, int quantity) {
        }

        static ShipmentResponse of(Shipment shipment) {
                List<Item> items = shipment.getItems().stream()
                                .map(item -> new Item(item.getOrderItem().getId(),
                                                item.getOrderItem().getProduct().getId(),
                                                item.getQuantity()))
                                .toList();
                return new ShipmentResponse(shipment.getId(), shipment.getOrder().getId(), shipment.getStatus(),
                                shipment.getPackedAt(), shipment.getShippedAt(), shipment.getDeliveredAt(), items);
        }
}
