package io.github.gsorak.inventory_orders_demo.inventory;

/**
 * A product that visitors of the public demo may create; SKU and name are
 * fixed.
 */
public record ProductTemplate(String sku, String name) {
}
