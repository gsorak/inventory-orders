package io.github.gsorak.inventory_orders_demo.inventory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record ReceiveStockRequest(@NotNull @Positive @Max(1_000_000) Integer quantity) {
}
