package io.github.gsorak.inventory_orders_demo.inventory;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

/**
 * Units entering on-hand stock: purchases, and returned goods that were
 * restocked. Used for inventory aging.
 */
@Entity
public class StockReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Product product;

    private int quantity;

    @Enumerated(EnumType.STRING)
    private StockReceiptSource source;

    private Instant receivedAt;

    protected StockReceipt() {
    }

    public StockReceipt(Product product, int quantity, StockReceiptSource source, Instant receivedAt) {
        this.product = product;
        this.quantity = quantity;
        this.source = source;
        this.receivedAt = receivedAt;
    }

    public Long getId() {
        return id;
    }

    public Product getProduct() {
        return product;
    }

    public int getQuantity() {
        return quantity;
    }

    public StockReceiptSource getSource() {
        return source;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }
}
