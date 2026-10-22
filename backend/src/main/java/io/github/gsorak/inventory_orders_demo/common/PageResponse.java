package io.github.gsorak.inventory_orders_demo.common;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

/** One page of a list resource; {@code page} is zero-based. */
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public static final String DEFAULT_SIZE = "20";
    public static final int MAX_SIZE = 100;

    public static PageRequest newestFirst(int page, int size) {
        return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id"));
    }

    public static <T> PageResponse<T> of(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }
}
