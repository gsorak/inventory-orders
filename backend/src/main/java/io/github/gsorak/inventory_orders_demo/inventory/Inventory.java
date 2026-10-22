package io.github.gsorak.inventory_orders_demo.inventory;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;

/**
 * Stock levels of one product. The quantities are read-only in Java: they
 * change only through the conditional
 * UPDATE statements in {@link InventoryRepository}, so concurrent transactions
 * never overwrite each other's changes.
 */
@Entity
public class Inventory {

    @Id
    private Long productId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    /** Units physically in the warehouse, including reserved units. */
    private int onHand;

    /**
     * Units promised to active reservations or to confirmed orders that have not
     * shipped yet.
     */
    private int reserved;

    protected Inventory() {
    }

    public Inventory(Product product) {
        this.product = product;
    }

    public Long getProductId() {
        return productId;
    }

    public Product getProduct() {
        return product;
    }

    public int getOnHand() {
        return onHand;
    }

    public int getReserved() {
        return reserved;
    }

    public int getAvailable() {
        return onHand - reserved;
    }
}
