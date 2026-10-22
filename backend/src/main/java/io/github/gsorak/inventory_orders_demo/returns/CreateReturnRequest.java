package io.github.gsorak.inventory_orders_demo.returns;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * An order item may appear on several lines, e.g. one unit unopened and one
 * damaged.
 */
public record CreateReturnRequest(@NotEmpty @Size(max = 100) List<@Valid @NotNull Line> items) {

        public record Line(
                        @NotNull Long orderItemId,
                        @NotNull @Positive Integer quantity,
                        @NotNull ReturnReason reason,
                        @NotNull ItemCondition condition) {
        }

        /** Identical for requests that differ only in line order. */
        public String canonicalForm() {
                return items.stream()
                                .map(line -> "%d:%d:%s:%s".formatted(line.orderItemId(), line.quantity(), line.reason(),
                                                line.condition()))
                                .sorted()
                                .toList()
                                .toString();
        }
}
