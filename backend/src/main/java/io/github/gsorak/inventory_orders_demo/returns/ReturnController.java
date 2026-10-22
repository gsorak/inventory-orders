package io.github.gsorak.inventory_orders_demo.returns;

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
public class ReturnController {

    private final ReturnService returnService;

    public ReturnController(ReturnService returnService) {
        this.returnService = returnService;
    }

    @PostMapping("/api/orders/{orderId}/returns")
    ResponseEntity<ReturnResponse> createReturn(@PathVariable long orderId,
            @RequestHeader(name = Idempotency.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody CreateReturnRequest request) {
        CreationResult<ReturnResponse> result = returnService.createReturn(orderId, request, idempotencyKey);
        return result.created()
                ? ResponseEntity.created(URI.create("/api/returns/" + result.resource().id())).body(result.resource())
                : ResponseEntity.ok(result.resource());
    }

    /** In the order they were made. */
    @GetMapping("/api/orders/{orderId}/returns")
    List<ReturnResponse> listReturns(@PathVariable long orderId) {
        return returnService.listForOrder(orderId);
    }

    @GetMapping("/api/returns/{returnId}")
    ReturnResponse getReturn(@PathVariable long returnId) {
        return returnService.get(returnId);
    }
}
