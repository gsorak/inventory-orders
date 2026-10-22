package io.github.gsorak.inventory_orders_demo.reservation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * {@code status} is the effective status: EXPIRED as soon as the expiry time
 * has passed. {@code stockReleasedAt}
 * stays null until the stock has actually been returned to availability (by
 * cancellation or by the sweeper).
 */
public record ReservationResponse(
                Long id,
                ReservationStatus status,
                Instant createdAt,
                Instant expiresAt,
                Instant confirmedAt,
                Instant stockReleasedAt,
                BigDecimal total,
                List<Item> items) {

        public record Item(Long productId, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {
        }

        static ReservationResponse of(Reservation reservation, Instant now) {
                List<Item> items = reservation.getItems().stream()
                                .map(item -> new Item(item.getProduct().getId(), item.getQuantity(),
                                                item.getUnitPrice(),
                                                item.lineTotal()))
                                .toList();
                BigDecimal total = items.stream().map(Item::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
                return new ReservationResponse(reservation.getId(), reservation.effectiveStatus(now),
                                reservation.getCreatedAt(), reservation.getExpiresAt(), reservation.getConfirmedAt(),
                                reservation.getStockReleasedAt(), total, items);
        }
}
