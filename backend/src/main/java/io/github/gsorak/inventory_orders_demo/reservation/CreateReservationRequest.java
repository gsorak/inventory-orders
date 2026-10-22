package io.github.gsorak.inventory_orders_demo.reservation;

import java.util.Collections;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateReservationRequest(@NotEmpty @Size(max = 100) List<@Valid @NotNull Line> items) {

    public record Line(@NotNull Long productId, @NotNull @Positive @Max(10_000) Integer quantity) {
    }

    /**
     * Each product may appear once; the sorted map gives both the canonical form
     * and the lock order.
     */
    public SortedMap<Long, Integer> quantitiesByProduct() {
        SortedMap<Long, Integer> quantities = new TreeMap<>();
        for (Line line : items) {
            if (quantities.putIfAbsent(line.productId(), line.quantity()) != null) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST,
                        "Product %d appears more than once".formatted(line.productId()));
            }
        }
        return Collections.unmodifiableSortedMap(quantities);
    }
}
