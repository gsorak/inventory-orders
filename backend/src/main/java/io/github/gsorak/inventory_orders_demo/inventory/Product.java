package io.github.gsorak.inventory_orders_demo.inventory;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String sku;

    private String name;

    private BigDecimal unitPrice;

    private int lowStockThreshold;

    private Instant createdAt;

    protected Product() {
    }

    public Product(String sku, String name, BigDecimal unitPrice, int lowStockThreshold, Instant createdAt) {
        this.sku = sku;
        this.name = name;
        this.unitPrice = unitPrice;
        this.lowStockThreshold = lowStockThreshold;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public int getLowStockThreshold() {
        return lowStockThreshold;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
