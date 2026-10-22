package io.github.gsorak.inventory_orders_demo.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Simulated payment-provider callback: payment for the reservation succeeded
 * with this reference.
 */
public record ConfirmPaymentRequest(@NotBlank @Size(max = 100) String paymentReference) {
}
