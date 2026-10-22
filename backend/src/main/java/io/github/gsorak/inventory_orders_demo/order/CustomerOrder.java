package io.github.gsorak.inventory_orders_demo.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.reservation.Reservation;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;

/**
 * A paid order. Its row lock (see {@link OrderRepository#findByIdForUpdate})
 * serializes every change to the order,
 * its items, its shipments and its returns.
 */
@Entity
public class CustomerOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long reservationId;

    private String paymentReference;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private BigDecimal grossTotal;

    private BigDecimal creditedTotal;

    private Instant confirmedAt;

    private Instant deliveredAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<OrderItem> items = new ArrayList<>();

    protected CustomerOrder() {
    }

    /**
     * Takes over the reservation's lines and prices; its reserved stock now belongs
     * to this order.
     */
    public static CustomerOrder fromConfirmedReservation(Reservation reservation, String paymentReference) {
        CustomerOrder order = new CustomerOrder();
        order.reservationId = reservation.getId();
        order.paymentReference = paymentReference;
        order.status = OrderStatus.CONFIRMED;
        order.confirmedAt = reservation.getConfirmedAt();
        order.creditedTotal = new BigDecimal("0.00");
        reservation.getItems().forEach(item -> order.items.add(
                new OrderItem(order, item.getProduct(), item.getQuantity(), item.getUnitPrice())));
        order.grossTotal = order.items.stream().map(OrderItem::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        return order;
    }

    public OrderItem item(long orderItemId) {
        return items.stream()
                .filter(item -> item.getId() == orderItemId)
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_REQUEST,
                        "Order item %d does not belong to order %d".formatted(orderItemId, id)));
    }

    public void startFulfilment() {
        if (status == OrderStatus.CONFIRMED) {
            status = OrderStatus.IN_FULFILMENT;
        }
    }

    public void completeIfFullyDelivered(Instant now) {
        if (status != OrderStatus.DELIVERED && items.stream().allMatch(OrderItem::isFullyDelivered)) {
            status = OrderStatus.DELIVERED;
            deliveredAt = now;
        }
    }

    public void addCredit(BigDecimal amount) {
        BigDecimal newCreditedTotal = creditedTotal.add(amount);
        if (newCreditedTotal.compareTo(grossTotal) > 0) {
            throw new IllegalStateException("Order %d would be credited more than its gross total".formatted(id));
        }
        creditedTotal = newCreditedTotal;
    }

    public BigDecimal netTotal() {
        return grossTotal.subtract(creditedTotal);
    }

    public Long getId() {
        return id;
    }

    public Long getReservationId() {
        return reservationId;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public BigDecimal getGrossTotal() {
        return grossTotal;
    }

    public BigDecimal getCreditedTotal() {
        return creditedTotal;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }

    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(items);
    }
}
