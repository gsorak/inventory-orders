package io.github.gsorak.inventory_orders_demo.inventory;

import java.math.BigDecimal;

public record ProductResponse(
        Long id,
        String sku,
        String name,
        BigDecimal unitPrice,
        int lowStockThreshold,
        StockLevels stock) {

    static ProductResponse of(Inventory inventory) {
        Product product = inventory.getProduct();
        return new ProductResponse(product.getId(), product.getSku(), product.getName(), product.getUnitPrice(),
                product.getLowStockThreshold(), StockLevels.of(inventory));
    }
}
