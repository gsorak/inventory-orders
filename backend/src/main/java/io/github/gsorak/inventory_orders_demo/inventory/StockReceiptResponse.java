package io.github.gsorak.inventory_orders_demo.inventory;

import java.time.Instant;

public record StockReceiptResponse(
                Long id,
                Long productId,
                int quantity,
                StockReceiptSource source,
                Instant receivedAt,
                StockLevels stock) {
}
