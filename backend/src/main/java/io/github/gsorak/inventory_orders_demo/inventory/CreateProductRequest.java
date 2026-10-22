package io.github.gsorak.inventory_orders_demo.inventory;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateProductRequest(
                @NotBlank @Size(max = 64) String sku,
                @NotBlank @Size(max = 200) String name,
                @NotNull @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal unitPrice,
                @NotNull @PositiveOrZero Integer lowStockThreshold) {
}
