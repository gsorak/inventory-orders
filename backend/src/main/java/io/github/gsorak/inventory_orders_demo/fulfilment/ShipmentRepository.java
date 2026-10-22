package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {

    List<Shipment> findByOrder_IdOrderByIdAsc(long orderId);

    /**
     * A scalar lookup, so no shipment entity is cached before the order lock is
     * taken.
     */
    @Query("select s.order.id from Shipment s where s.id = :shipmentId")
    Optional<Long> findOrderIdById(long shipmentId);

    Optional<Shipment> findByIdempotencyKey(String idempotencyKey);
}
