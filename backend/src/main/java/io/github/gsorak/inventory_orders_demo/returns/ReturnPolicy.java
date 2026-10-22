package io.github.gsorak.inventory_orders_demo.returns;

import java.math.BigDecimal;

import io.github.gsorak.inventory_orders_demo.order.OrderItem;

/** The business rules for returns, kept in one place. */
public final class ReturnPolicy {

    private ReturnPolicy() {
    }

    /**
     * Only unopened goods returned for a non-fault reason can be resold; everything
     * else is discarded.
     */
    public static Disposition dispositionFor(ReturnReason reason, ItemCondition condition) {
        if (condition != ItemCondition.UNOPENED) {
            return Disposition.DISCARD;
        }
        return switch (reason) {
            case NO_LONGER_NEEDED, WRONG_ITEM_SENT -> Disposition.RESTOCK;
            case DEFECTIVE, DAMAGED_IN_TRANSIT -> Disposition.DISCARD;
        };
    }

    /** Full refund of the price paid, whatever the disposition. */
    public static BigDecimal refundFor(OrderItem orderItem, int quantity) {
        return orderItem.getUnitPrice().multiply(BigDecimal.valueOf(quantity));
    }
}
