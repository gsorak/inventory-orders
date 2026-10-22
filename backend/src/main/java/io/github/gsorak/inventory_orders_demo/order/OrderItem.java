package io.github.gsorak.inventory_orders_demo.order;

import java.math.BigDecimal;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.Product;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

/**
 * One product line of an order, with cumulative fulfilment counters:
 * 
 * <pre>
 * 0 ≤ returned ≤ delivered ≤ shipped ≤ packed ≤ quantity          (also a database CHECK)
 * packed    = Σ shipment item quantities over all of this item's shipments
 * shipped   = Σ over shipments in state SHIPPED or DELIVERED
 * delivered = Σ over shipments in state DELIVERED
 * returned  = Σ return item quantities
 * units of this item still counted in inventory.reserved = quantity − shipped
 * </pre>
 * 
 * Counters only change inside a transaction holding the order row lock, and
 * each shipment state change applies
 * its quantities exactly once, so repeated or concurrent requests cannot
 * double-count.
 */
@Entity
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private CustomerOrder order;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Product product;

    private BigDecimal unitPrice;

    private int quantity;

    private int packedQuantity;

    private int shippedQuantity;

    private int deliveredQuantity;

    private int returnedQuantity;

    protected OrderItem() {
    }

    OrderItem(CustomerOrder order, Product product, int quantity, BigDecimal unitPrice) {
        this.order = order;
        this.product = product;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
    }

    public int unpackedQuantity() {
        return quantity - packedQuantity;
    }

    public int returnableQuantity() {
        return deliveredQuantity - returnedQuantity;
    }

    public void pack(int units) {
        if (units > unpackedQuantity()) {
            throw new BusinessException(ErrorCode.QUANTITY_EXCEEDED,
                    "Cannot pack %d units of order item %d: only %d remain unpacked"
                            .formatted(units, id, unpackedQuantity()));
        }
        packedQuantity += units;
    }

    public void ship(int units) {
        requireInvariant(shippedQuantity + units <= packedQuantity, "ship", units);
        shippedQuantity += units;
    }

    public void deliver(int units) {
        requireInvariant(deliveredQuantity + units <= shippedQuantity, "deliver", units);
        deliveredQuantity += units;
    }

    public void recordReturn(int units) {
        if (units > returnableQuantity()) {
            throw new BusinessException(ErrorCode.QUANTITY_EXCEEDED,
                    "Cannot return %d units of order item %d: only %d delivered units have not been returned"
                            .formatted(units, id, returnableQuantity()));
        }
        returnedQuantity += units;
    }

    boolean isFullyDelivered() {
        return deliveredQuantity == quantity;
    }

    public BigDecimal lineTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }

    /**
     * Shipping and delivery quantities come from an already validated shipment; a
     * violation is a bug.
     */
    private void requireInvariant(boolean holds, String operation, int units) {
        if (!holds) {
            throw new IllegalStateException(
                    "Order item %d invariant violated: cannot %s %d units".formatted(id, operation, units));
        }
    }

    public Long getId() {
        return id;
    }

    public CustomerOrder getOrder() {
        return order;
    }

    public Product getProduct() {
        return product;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public int getQuantity() {
        return quantity;
    }

    public int getPackedQuantity() {
        return packedQuantity;
    }

    public int getShippedQuantity() {
        return shippedQuantity;
    }

    public int getDeliveredQuantity() {
        return deliveredQuantity;
    }

    public int getReturnedQuantity() {
        return returnedQuantity;
    }
}
