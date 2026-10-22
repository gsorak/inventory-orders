package io.github.gsorak.inventory_orders_demo.common;

import java.math.BigDecimal;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Extra limits for the public demo (app.demo.enabled); local development, tests
 * and E2E are unaffected.
 */
@Component
public class DemoMode {

    public static final BigDecimal MAX_UNIT_PRICE = new BigDecimal("10000.00");
    public static final int MAX_LOW_STOCK_THRESHOLD = 1_000;
    public static final int MAX_STOCK_RECEIPT_QUANTITY = 1_000;
    public static final int MAX_RESERVATION_LINE_QUANTITY = 20;

    private final boolean enabled;

    public DemoMode(@Value("${app.demo.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void requireProductLimits(BigDecimal unitPrice, int lowStockThreshold) {
        require(unitPrice.compareTo(MAX_UNIT_PRICE) <= 0, "the unit price is at most " + MAX_UNIT_PRICE);
        require(lowStockThreshold <= MAX_LOW_STOCK_THRESHOLD,
                "the low-stock threshold is at most " + MAX_LOW_STOCK_THRESHOLD);
    }

    public void requireStockReceiptLimit(int quantity) {
        require(quantity <= MAX_STOCK_RECEIPT_QUANTITY,
                "at most %d units can be received at once".formatted(MAX_STOCK_RECEIPT_QUANTITY));
    }

    public void requireReservationLimits(Map<Long, Integer> quantitiesByProduct) {
        quantitiesByProduct.forEach((productId, quantity) -> require(quantity <= MAX_RESERVATION_LINE_QUANTITY,
                "at most %d units of a product can be reserved (product %d: %d requested)"
                        .formatted(MAX_RESERVATION_LINE_QUANTITY, productId, quantity)));
    }

    /**
     * Payments are simulated; the frontend always sends this reference, so no
     * visitor text is stored.
     */
    public void requirePaymentReference(long reservationId, String paymentReference) {
        String expected = "SIM-" + reservationId;
        require(expected.equals(paymentReference), "the payment reference must be " + expected);
    }

    private void require(boolean condition, String rule) {
        if (enabled && !condition) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "In the public demo, " + rule + ".");
        }
    }
}
