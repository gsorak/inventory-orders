package io.github.gsorak.inventory_orders_demo.returns;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderReturnRepository extends JpaRepository<OrderReturn, Long> {

    List<OrderReturn> findByOrder_IdOrderByIdAsc(long orderId);

    Optional<OrderReturn> findByIdempotencyKey(String idempotencyKey);
}
