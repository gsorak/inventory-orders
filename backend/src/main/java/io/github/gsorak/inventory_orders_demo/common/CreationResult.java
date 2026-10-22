package io.github.gsorak.inventory_orders_demo.common;

/**
 * Result of an idempotent create: either a new resource or the replay of an
 * earlier identical request.
 */
public record CreationResult<T>(T resource, boolean created) {

    public static <T> CreationResult<T> created(T resource) {
        return new CreationResult<>(resource, true);
    }

    public static <T> CreationResult<T> replayed(T resource) {
        return new CreationResult<>(resource, false);
    }
}
