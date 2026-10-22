package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.Idempotency;
import jakarta.validation.Valid;

@RestController
public class ShipmentController {

    private final FulfilmentService fulfilmentService;

    public ShipmentController(FulfilmentService fulfilmentService) {
        this.fulfilmentService = fulfilmentService;
    }

    @PostMapping("/api/orders/{orderId}/shipments")
    ResponseEntity<ShipmentResponse> createShipment(@PathVariable long orderId,
            @RequestHeader(name = Idempotency.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody CreateShipmentRequest request) {
        CreationResult<ShipmentResponse> result = fulfilmentService.createShipment(orderId, request, idempotencyKey);
        return result.created()
                ? ResponseEntity.created(URI.create("/api/shipments/" + result.resource().id()))
                        .body(result.resource())
                : ResponseEntity.ok(result.resource());
    }

    /** In packing order. */
    @GetMapping("/api/orders/{orderId}/shipments")
    List<ShipmentResponse> listShipments(@PathVariable long orderId) {
        return fulfilmentService.listForOrder(orderId);
    }

    @GetMapping("/api/shipments/{shipmentId}")
    ShipmentResponse getShipment(@PathVariable long shipmentId) {
        return fulfilmentService.get(shipmentId);
    }

    @PostMapping("/api/shipments/{shipmentId}/ship")
    ShipmentResponse ship(@PathVariable long shipmentId) {
        return fulfilmentService.ship(shipmentId);
    }

    @PostMapping("/api/shipments/{shipmentId}/deliver")
    ShipmentResponse deliver(@PathVariable long shipmentId) {
        return fulfilmentService.deliver(shipmentId);
    }
}
