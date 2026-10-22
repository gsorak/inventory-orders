package io.github.gsorak.inventory_orders_demo.reservation;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Physically releases the stock of logically expired reservations. Each
 * reservation is expired in its own
 * short transaction, so one failure does not undo the others, and work left
 * over is picked up by the next sweep.
 * Running several sweeps concurrently (or on several instances) is safe because
 * each expiry locks the reservation
 * row and re-checks its status, so stock is released exactly once.
 */
@Component
public class ReservationExpirySweeper {

    private static final Logger log = LoggerFactory.getLogger(ReservationExpirySweeper.class);
    private static final int BATCH_SIZE = 500;

    private final ReservationRepository reservationRepository;
    private final ReservationService reservationService;
    private final Clock clock;

    public ReservationExpirySweeper(ReservationRepository reservationRepository,
            ReservationService reservationService, Clock clock) {
        this.reservationRepository = reservationRepository;
        this.reservationService = reservationService;
        this.clock = clock;
    }

    /** @return the number of reservations this sweep expired */
    @Scheduled(fixedDelayString = "${inventory.reservation.expiry-sweep-interval:PT30S}")
    public int expireDueReservations() {
        List<Long> dueIds = reservationRepository.findIdsDueForExpiry(clock.instant(), Limit.of(BATCH_SIZE));
        int expired = 0;
        for (Long reservationId : dueIds) {
            try {
                if (reservationService.expire(reservationId)) {
                    expired++;
                }
            } catch (ConcurrencyFailureException e) {
                log.warn("Reservation {} is locked; it will be retried on the next sweep: {}", reservationId,
                        e.getMessage());
            } catch (RuntimeException e) {
                log.error("Failed to expire reservation {}", reservationId, e);
            }
        }
        if (expired > 0) {
            log.info("Expired {} reservation(s) and released their stock", expired);
        }
        return expired;
    }
}
