package io.github.gsorak.inventory_orders_demo.order;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface OrderRepository extends JpaRepository<CustomerOrder, Long> {

    /**
     * {@code SELECT ... FOR UPDATE} on the order row only; its items are loaded
     * afterwards under this lock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from CustomerOrder o where o.id = :id")
    Optional<CustomerOrder> findByIdForUpdate(long id);

    Optional<CustomerOrder> findByReservationId(long reservationId);

    boolean existsByPaymentReference(String paymentReference);

    /** Orders whose last unit was delivered within [from, to). */
    @Query("select o from CustomerOrder o where o.deliveredAt >= :from and o.deliveredAt < :to")
    List<CustomerOrder> findDeliveredBetween(Instant from, Instant to);
}
