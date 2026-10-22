package io.github.gsorak.inventory_orders_demo.inventory;

public record StockLevels(int onHand, int reserved, int available) {

    public static StockLevels of(Inventory inventory) {
        return new StockLevels(inventory.getOnHand(), inventory.getReserved(), inventory.getAvailable());
    }
}
