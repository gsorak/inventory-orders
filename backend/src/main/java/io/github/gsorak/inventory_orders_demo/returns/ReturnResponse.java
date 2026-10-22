package io.github.gsorak.inventory_orders_demo.returns;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import io.github.gsorak.inventory_orders_demo.order.CustomerOrder;

public record ReturnResponse(
                Long id,
                Long orderId,
                Instant returnedAt,
                List<Item> items,
                CreditNoteView creditNote,
                OrderTotals orderTotals) {

        public record Item(
                        Long orderItemId,
                        Long productId,
                        int quantity,
                        ReturnReason reason,
                        ItemCondition condition,
                        Disposition disposition,
                        BigDecimal refundAmount) {
        }

        public record CreditNoteView(String number, BigDecimal amount, Instant issuedAt) {
        }

        public record OrderTotals(BigDecimal grossTotal, BigDecimal creditedTotal, BigDecimal netTotal) {
        }

        static ReturnResponse of(OrderReturn orderReturn) {
                List<Item> items = orderReturn.getItems().stream()
                                .map(item -> new Item(item.getOrderItem().getId(),
                                                item.getOrderItem().getProduct().getId(),
                                                item.getQuantity(), item.getReason(), item.getCondition(),
                                                item.getDisposition(),
                                                item.getRefundAmount()))
                                .toList();
                CreditNote creditNote = orderReturn.getCreditNote();
                CustomerOrder order = orderReturn.getOrder();
                return new ReturnResponse(orderReturn.getId(), order.getId(), orderReturn.getReturnedAt(), items,
                                new CreditNoteView(creditNote.number(), creditNote.getAmount(),
                                                creditNote.getIssuedAt()),
                                new OrderTotals(order.getGrossTotal(), order.getCreditedTotal(), order.netTotal()));
        }
}
