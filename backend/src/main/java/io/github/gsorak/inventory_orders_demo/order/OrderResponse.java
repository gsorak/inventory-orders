package io.github.gsorak.inventory_orders_demo.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OrderResponse(
                Long id,
                Long reservationId,
                String paymentReference,
                OrderStatus status,
                Instant confirmedAt,
                Instant deliveredAt,
                BigDecimal grossTotal,
                BigDecimal creditedTotal,
                BigDecimal netTotal,
                List<Item> items) {

        public record Item(
                        Long id,
                        Long productId,
                        BigDecimal unitPrice,
                        int quantity,
                        int packedQuantity,
                        int shippedQuantity,
                        int deliveredQuantity,
                        int returnedQuantity,
                        BigDecimal lineTotal) {
        }

        public static OrderResponse of(CustomerOrder order) {
                List<Item> items = order.getItems().stream()
                                .map(item -> new Item(item.getId(), item.getProduct().getId(), item.getUnitPrice(),
                                                item.getQuantity(), item.getPackedQuantity(), item.getShippedQuantity(),
                                                item.getDeliveredQuantity(), item.getReturnedQuantity(),
                                                item.lineTotal()))
                                .toList();
                return new OrderResponse(order.getId(), order.getReservationId(), order.getPaymentReference(),
                                order.getStatus(), order.getConfirmedAt(), order.getDeliveredAt(),
                                order.getGrossTotal(),
                                order.getCreditedTotal(), order.netTotal(), items);
        }
}
