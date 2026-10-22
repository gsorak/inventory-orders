package io.github.gsorak.inventory_orders_demo.inventory;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface StockReceiptRepository extends JpaRepository<StockReceipt, Long> {

    @Query("""
            select r from StockReceipt r where r.product.id in :productIds
            order by r.product.id, r.receivedAt desc, r.id desc""")
    List<StockReceipt> findNewestFirst(Collection<Long> productIds);
}
