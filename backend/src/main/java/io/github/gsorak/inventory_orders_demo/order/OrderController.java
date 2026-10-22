package io.github.gsorak.inventory_orders_demo.order;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    /**
     * 201 with the new order; 200 with the existing order when the same
     * confirmation is repeated.
     */
    @PostMapping("/api/reservations/{reservationId}/confirm")
    ResponseEntity<OrderResponse> confirmPayment(@PathVariable long reservationId,
            @Valid @RequestBody ConfirmPaymentRequest request) {
        CreationResult<OrderResponse> result = orderService.confirmPayment(reservationId, request.paymentReference());
        return result.created()
                ? ResponseEntity.created(URI.create("/api/orders/" + result.resource().id())).body(result.resource())
                : ResponseEntity.ok(result.resource());
    }

    /**
     * 404 until the reservation is confirmed. Read-only, so safe for recovering a
     * lost confirmation response.
     */
    @GetMapping("/api/reservations/{reservationId}/order")
    OrderResponse getOrderForReservation(@PathVariable long reservationId) {
        return orderService.getByReservation(reservationId);
    }

    /** Newest first. */
    @GetMapping("/api/orders")
    PageResponse<OrderResponse> listOrders(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = PageResponse.DEFAULT_SIZE) @Min(1) @Max(PageResponse.MAX_SIZE) int size) {
        return orderService.list(page, size);
    }

    @GetMapping("/api/orders/{orderId}")
    OrderResponse getOrder(@PathVariable long orderId) {
        return orderService.get(orderId);
    }
}
