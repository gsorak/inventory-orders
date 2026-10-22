package io.github.gsorak.inventory_orders_demo.returns;

import java.math.BigDecimal;

import io.github.gsorak.inventory_orders_demo.order.OrderItem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class ReturnItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "return_id")
    private OrderReturn orderReturn;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private OrderItem orderItem;

    private int quantity;

    @Enumerated(EnumType.STRING)
    private ReturnReason reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_condition")
    private ItemCondition condition;

    @Enumerated(EnumType.STRING)
    private Disposition disposition;

    private BigDecimal refundAmount;

    protected ReturnItem() {
    }

    ReturnItem(OrderReturn orderReturn, OrderItem orderItem, int quantity, ReturnReason reason,
            ItemCondition condition) {
        this.orderReturn = orderReturn;
        this.orderItem = orderItem;
        this.quantity = quantity;
        this.reason = reason;
        this.condition = condition;
        this.disposition = ReturnPolicy.dispositionFor(reason, condition);
        this.refundAmount = ReturnPolicy.refundFor(orderItem, quantity);
    }

    public OrderItem getOrderItem() {
        return orderItem;
    }

    public int getQuantity() {
        return quantity;
    }

    public ReturnReason getReason() {
        return reason;
    }

    public ItemCondition getCondition() {
        return condition;
    }

    public Disposition getDisposition() {
        return disposition;
    }

    public BigDecimal getRefundAmount() {
        return refundAmount;
    }
}
