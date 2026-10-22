package io.github.gsorak.inventory_orders_demo.inventory;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/**
 * Every quantity change is a single conditional UPDATE. The database row lock
 * taken by the UPDATE serializes
 * concurrent changes to the same product, and the WHERE clause is evaluated
 * against the latest committed values,
 * so a check-then-act race is impossible. Each method returns the number of
 * updated rows: 0 means the condition
 * did not hold and nothing changed.
 * <p>
 * These JPQL bulk updates bypass the persistence context: an {@link Inventory}
 * already loaded in the same
 * transaction keeps its old quantities, and querying it again returns that same
 * cached instance. Callers that need
 * current quantities must either not load the entity before the update or
 * explicitly refresh it, e.g. with
 * {@code EntityManager.refresh}.
 */
public interface InventoryRepository extends JpaRepository<Inventory, Long> {

        @Modifying(flushAutomatically = true)
        @Query("""
                        update Inventory i set i.reserved = i.reserved + :quantity
                        where i.productId = :productId and i.onHand - i.reserved >= :quantity""")
        int reserve(long productId, int quantity);

        @Modifying(flushAutomatically = true)
        @Query("""
                        update Inventory i set i.reserved = i.reserved - :quantity
                        where i.productId = :productId and i.reserved >= :quantity""")
        int release(long productId, int quantity);

        @Modifying(flushAutomatically = true)
        @Query("""
                        update Inventory i set i.onHand = i.onHand - :quantity, i.reserved = i.reserved - :quantity
                        where i.productId = :productId and i.reserved >= :quantity""")
        int removeShipped(long productId, int quantity);

        @Modifying(flushAutomatically = true)
        @Query("update Inventory i set i.onHand = i.onHand + :quantity where i.productId = :productId")
        int addOnHand(long productId, int quantity);

        @Query("select i.onHand - i.reserved from Inventory i where i.productId = :productId")
        Optional<Integer> findAvailableQuantity(long productId);

        @Query("select i from Inventory i join fetch i.product where i.productId = :productId")
        Optional<Inventory> findWithProduct(long productId);

        @Query("select i from Inventory i join fetch i.product p order by p.id")
        List<Inventory> findAllWithProduct();

        @Query("""
                        select i from Inventory i join fetch i.product p
                        where i.onHand - i.reserved <= p.lowStockThreshold
                        order by p.id""")
        List<Inventory> findAtOrBelowLowStockThreshold();

        @Query("select i from Inventory i join fetch i.product p where i.onHand > 0 order by p.id")
        List<Inventory> findAllInStock();
}
