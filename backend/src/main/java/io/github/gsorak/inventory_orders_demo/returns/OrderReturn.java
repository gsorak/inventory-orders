package io.github.gsorak.inventory_orders_demo.returns;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import io.github.gsorak.inventory_orders_demo.order.CustomerOrder;
import io.github.gsorak.inventory_orders_demo.order.OrderItem;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;

/**
 * Goods sent back against delivered order items. Callers must hold the order
 * row lock.
 */
@Entity
public class OrderReturn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private CustomerOrder order;

    private String idempotencyKey;

    private String requestFingerprint;

    private Instant returnedAt;

    @OneToMany(mappedBy = "orderReturn", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<ReturnItem> items = new ArrayList<>();

    @OneToOne(mappedBy = "orderReturn", cascade = CascadeType.ALL)
    private CreditNote creditNote;

    protected OrderReturn() {
    }

    public OrderReturn(CustomerOrder order, Instant returnedAt, String idempotencyKey, String requestFingerprint) {
        this.order = order;
        this.returnedAt = returnedAt;
        this.idempotencyKey = idempotencyKey;
        this.requestFingerprint = requestFingerprint;
    }

    /**
     * Fails with QUANTITY_EXCEEDED if more units would be returned than were
     * delivered and not yet returned.
     */
    public void addItem(OrderItem orderItem, int quantity, ReturnReason reason, ItemCondition condition) {
        orderItem.recordReturn(quantity);
        items.add(new ReturnItem(this, orderItem, quantity, reason, condition));
    }

    /**
     * Credits the order with the total refund. Called once, after all items are
     * added.
     */
    public void issueCreditNote() {
        BigDecimal amount = items.stream().map(ReturnItem::getRefundAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        order.addCredit(amount);
        creditNote = new CreditNote(this, amount, returnedAt);
    }

    /** Ascending product id order: the global lock order for inventory rows. */
    public SortedMap<Long, Integer> restockQuantitiesByProduct() {
        SortedMap<Long, Integer> quantities = new TreeMap<>();
        items.stream()
                .filter(item -> item.getDisposition() == Disposition.RESTOCK)
                .forEach(item -> quantities.merge(
                        item.getOrderItem().getProduct().getId(), item.getQuantity(), Integer::sum));
        return Collections.unmodifiableSortedMap(quantities);
    }

    public Long getId() {
        return id;
    }

    public CustomerOrder getOrder() {
        return order;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public Instant getReturnedAt() {
        return returnedAt;
    }

    public List<ReturnItem> getItems() {
        return Collections.unmodifiableList(items);
    }

    public CreditNote getCreditNote() {
        return creditNote;
    }
}
