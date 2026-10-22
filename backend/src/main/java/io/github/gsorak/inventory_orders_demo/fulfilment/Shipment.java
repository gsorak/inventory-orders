package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.order.CustomerOrder;
import io.github.gsorak.inventory_orders_demo.order.OrderItem;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;

/**
 * A parcel containing some quantity of one or more order items. Each state
 * change applies its quantities to the
 * order item counters exactly once; repeating the same change is a no-op.
 * Callers must hold the order row lock.
 */
@Entity
public class Shipment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private CustomerOrder order;

    private String idempotencyKey;

    private String requestFingerprint;

    @Enumerated(EnumType.STRING)
    private ShipmentStatus status;

    private Instant packedAt;

    private Instant shippedAt;

    private Instant deliveredAt;

    @OneToMany(mappedBy = "shipment", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<ShipmentItem> items = new ArrayList<>();

    protected Shipment() {
    }

    /**
     * Fails with QUANTITY_EXCEEDED, changing nothing, if any line exceeds the
     * item's unpacked quantity.
     */
    public static Shipment pack(CustomerOrder order, SortedMap<Long, Integer> quantitiesByOrderItem, Instant now,
            String idempotencyKey, String requestFingerprint) {
        Shipment shipment = new Shipment();
        shipment.order = order;
        shipment.status = ShipmentStatus.PACKED;
        shipment.packedAt = now;
        shipment.idempotencyKey = idempotencyKey;
        shipment.requestFingerprint = requestFingerprint;
        quantitiesByOrderItem.forEach((orderItemId, quantity) -> {
            OrderItem orderItem = order.item(orderItemId);
            orderItem.pack(quantity);
            shipment.items.add(new ShipmentItem(shipment, orderItem, quantity));
        });
        order.startFulfilment();
        return shipment;
    }

    /**
     * @return true if the caller must remove the shipped units from inventory;
     *         false if already shipped
     */
    public boolean ship(Instant now) {
        if (status == ShipmentStatus.SHIPPED) {
            return false;
        }
        requireStatus(ShipmentStatus.PACKED, "ship");
        items.forEach(item -> item.getOrderItem().ship(item.getQuantity()));
        status = ShipmentStatus.SHIPPED;
        shippedAt = now;
        return true;
    }

    /** @return false if already delivered */
    public boolean deliver(Instant now) {
        if (status == ShipmentStatus.DELIVERED) {
            return false;
        }
        requireStatus(ShipmentStatus.SHIPPED, "deliver");
        items.forEach(item -> item.getOrderItem().deliver(item.getQuantity()));
        status = ShipmentStatus.DELIVERED;
        deliveredAt = now;
        order.completeIfFullyDelivered(now);
        return true;
    }

    /** Ascending product id order: the global lock order for inventory rows. */
    public SortedMap<Long, Integer> quantitiesByProduct() {
        SortedMap<Long, Integer> quantities = new TreeMap<>();
        items.forEach(item -> quantities.merge(
                item.getOrderItem().getProduct().getId(), item.getQuantity(), Integer::sum));
        return Collections.unmodifiableSortedMap(quantities);
    }

    private void requireStatus(ShipmentStatus required, String action) {
        if (status != required) {
            throw new BusinessException(ErrorCode.INVALID_STATE_TRANSITION,
                    "Cannot %s shipment %d: it is %s".formatted(action, id, status));
        }
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

    public ShipmentStatus getStatus() {
        return status;
    }

    public Instant getPackedAt() {
        return packedAt;
    }

    public Instant getShippedAt() {
        return shippedAt;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }

    public List<ShipmentItem> getItems() {
        return Collections.unmodifiableList(items);
    }
}
