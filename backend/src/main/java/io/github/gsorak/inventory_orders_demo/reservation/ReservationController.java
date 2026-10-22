package io.github.gsorak.inventory_orders_demo.reservation;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.Idempotency;
import io.github.gsorak.inventory_orders_demo.common.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    /**
     * 201 for a new reservation; 200 when an identical request with the same
     * Idempotency-Key is replayed.
     */
    @PostMapping
    ResponseEntity<ReservationResponse> createReservation(
            @RequestHeader(name = Idempotency.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody CreateReservationRequest request) {
        CreationResult<ReservationResponse> result = reservationService.create(request, idempotencyKey);
        return result.created()
                ? ResponseEntity.created(URI.create("/api/reservations/" + result.resource().id()))
                        .body(result.resource())
                : ResponseEntity.ok(result.resource());
    }

    /** Newest first. */
    @GetMapping
    PageResponse<ReservationResponse> listReservations(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = PageResponse.DEFAULT_SIZE) @Min(1) @Max(PageResponse.MAX_SIZE) int size) {
        return reservationService.list(page, size);
    }

    @GetMapping("/{reservationId}")
    ReservationResponse getReservation(@PathVariable long reservationId) {
        return reservationService.get(reservationId);
    }

    @PostMapping("/{reservationId}/cancel")
    ReservationResponse cancelReservation(@PathVariable long reservationId) {
        return reservationService.cancel(reservationId);
    }
}
