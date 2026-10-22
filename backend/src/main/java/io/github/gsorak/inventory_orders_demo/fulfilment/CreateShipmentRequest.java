package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.util.Collections;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateShipmentRequest(@NotEmpty @Size(max = 100) List<@Valid @NotNull Line> items) {

    public record Line(@NotNull Long orderItemId, @NotNull @Positive Integer quantity) {
    }

    public SortedMap<Long, Integer> quantitiesByOrderItem() {
        SortedMap<Long, Integer> quantities = new TreeMap<>();
        for (Line line : items) {
            if (quantities.putIfAbsent(line.orderItemId(), line.quantity()) != null) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST,
                        "Order item %d appears more than once".formatted(line.orderItemId()));
            }
        }
        return Collections.unmodifiableSortedMap(quantities);
    }
}
