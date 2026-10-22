package io.github.gsorak.inventory_orders_demo.fulfilment;

import io.github.gsorak.inventory_orders_demo.order.OrderItem;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

@Entity
public class ShipmentItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Shipment shipment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private OrderItem orderItem;

    private int quantity;

    protected ShipmentItem() {
    }

    ShipmentItem(Shipment shipment, OrderItem orderItem, int quantity) {
        this.shipment = shipment;
        this.orderItem = orderItem;
        this.quantity = quantity;
    }

    public OrderItem getOrderItem() {
        return orderItem;
    }

    public int getQuantity() {
        return quantity;
    }
}
