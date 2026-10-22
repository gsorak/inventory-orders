package io.github.gsorak.inventory_orders_demo.reservation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

  /**
   * {@code SELECT ... FOR UPDATE}: serializes confirm, cancel and expire of one
   * reservation. The status is read
   * after the lock is granted, so the second of two racing transactions sees the
   * first one's outcome.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from Reservation r where r.id = :id")
  Optional<Reservation> findByIdForUpdate(long id);

  Optional<Reservation> findByIdempotencyKey(String idempotencyKey);

  @Query("""
      select r.id from Reservation r
      where r.status = io.github.gsorak.inventory_orders_demo.reservation.ReservationStatus.ACTIVE
        and r.expiresAt <= :now
      order by r.expiresAt""")
  List<Long> findIdsDueForExpiry(Instant now, Limit limit);
}
