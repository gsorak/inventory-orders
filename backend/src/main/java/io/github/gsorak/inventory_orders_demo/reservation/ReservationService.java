package io.github.gsorak.inventory_orders_demo.reservation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.SortedMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.DemoMode;
import io.github.gsorak.inventory_orders_demo.common.Idempotency;
import io.github.gsorak.inventory_orders_demo.common.PageResponse;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryService;
import io.github.gsorak.inventory_orders_demo.inventory.ProductRepository;

/**
 * Lock order in every method: the reservation row first, then inventory rows in
 * ascending product id order.
 */
@Service
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final ProductRepository productRepository;
    private final InventoryService inventoryService;
    private final DemoMode demoMode;
    private final Clock clock;
    private final Duration ttl;

    public ReservationService(ReservationRepository reservationRepository, ProductRepository productRepository,
            InventoryService inventoryService, DemoMode demoMode, Clock clock,
            @Value("${inventory.reservation.ttl:PT15M}") Duration ttl) {
        this.reservationRepository = reservationRepository;
        this.productRepository = productRepository;
        this.inventoryService = inventoryService;
        this.demoMode = demoMode;
        this.clock = clock;
        this.ttl = ttl;
    }

    /**
     * Two concurrent requests with the same new idempotency key cannot both
     * succeed: the unique key constraint
     * rejects the second insert, rolling back its transaction, and the client gets
     * a retryable conflict.
     */
    @Transactional
    public CreationResult<ReservationResponse> create(CreateReservationRequest request, String idempotencyKey) {
        Idempotency.validateKey(idempotencyKey);
        SortedMap<Long, Integer> quantities = request.quantitiesByProduct();
        demoMode.requireReservationLimits(quantities);
        String fingerprint = idempotencyKey == null ? null : Idempotency.fingerprint("reservation:" + quantities);
        Instant now = clock.instant();

        if (idempotencyKey != null) {
            Optional<Reservation> previous = reservationRepository.findByIdempotencyKey(idempotencyKey);
            if (previous.isPresent()) {
                Idempotency.requireSameRequest(idempotencyKey, previous.get().getRequestFingerprint(), fingerprint);
                return CreationResult.replayed(ReservationResponse.of(previous.get(), now));
            }
        }

        Reservation reservation = new Reservation(now, now.plus(ttl), idempotencyKey, fingerprint);
        quantities.forEach((productId, quantity) -> reservation.addItem(productRepository.findById(productId)
                .orElseThrow(() -> BusinessException.notFound("Product", productId)), quantity));
        reservationRepository.save(reservation);
        inventoryService.reserve(quantities);
        return CreationResult.created(ReservationResponse.of(reservation, now));
    }

    @Transactional(readOnly = true)
    public ReservationResponse get(long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> BusinessException.notFound("Reservation", reservationId));
        return ReservationResponse.of(reservation, clock.instant());
    }

    @Transactional(readOnly = true)
    public PageResponse<ReservationResponse> list(int page, int size) {
        Instant now = clock.instant();
        return PageResponse.of(reservationRepository.findAll(PageResponse.newestFirst(page, size))
                .map(reservation -> ReservationResponse.of(reservation, now)));
    }

    /** Idempotent: cancelling a cancelled reservation changes nothing. */
    @Transactional
    public ReservationResponse cancel(long reservationId) {
        Instant now = clock.instant();
        Reservation reservation = lockReservation(reservationId);
        if (reservation.cancel(now)) {
            inventoryService.release(reservation.quantitiesByProduct());
        }
        return ReservationResponse.of(reservation, now);
    }

    /**
     * Physically releases a logically expired reservation. @return false if it was
     * not due or no longer active
     */
    @Transactional
    public boolean expire(long reservationId) {
        Reservation reservation = lockReservation(reservationId);
        if (!reservation.expire(clock.instant())) {
            return false;
        }
        inventoryService.release(reservation.quantitiesByProduct());
        return true;
    }

    /**
     * For callers that change a reservation inside their own transaction, e.g.
     * payment confirmation.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Reservation lockReservation(long reservationId) {
        return reservationRepository.findByIdForUpdate(reservationId)
                .orElseThrow(() -> BusinessException.notFound("Reservation", reservationId));
    }
}
