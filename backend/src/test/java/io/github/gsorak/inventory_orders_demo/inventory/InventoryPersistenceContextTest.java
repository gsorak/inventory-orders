package io.github.gsorak.inventory_orders_demo.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;
import jakarta.persistence.EntityManager;

/**
 * Pins down how the JPQL bulk updates in {@link InventoryRepository} interact
 * with the persistence context, since
 * they bypass entity change tracking.
 */
class InventoryPersistenceContextTest extends IntegrationTest {

    @Autowired
    InventoryRepository inventoryRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    TransactionTemplate transactionTemplate;

    @Autowired
    EntityManager entityManager;

    /**
     * Why services never read Inventory quantities from an instance loaded before a
     * bulk update.
     */
    @Test
    void bulkUpdateDoesNotRefreshAnInventoryAlreadyManagedInTheSameTransaction() {
        long productId = fixtures.createProduct("1.00", 10);

        transactionTemplate.executeWithoutResult(status -> {
            Inventory managed = entityManager.find(Inventory.class, productId);
            assertThat(inventoryRepository.reserve(productId, 3)).isEqualTo(1);

            // Re-querying returns the cached instance with its pre-update values.
            assertThat(inventoryRepository.findWithProduct(productId).orElseThrow()).isSameAs(managed);
            assertThat(managed.getReserved()).isZero();

            entityManager.refresh(managed);
            assertThat(managed.getReserved()).isEqualTo(3);
        });
    }

    @Test
    void staleButUnmodifiedInventoryIsNotWrittenBackOverBulkUpdatesOnCommit() {
        long productId = fixtures.createProduct("1.00", 10);

        transactionTemplate.executeWithoutResult(status -> {
            entityManager.find(Inventory.class, productId);
            inventoryRepository.reserve(productId, 3);
            inventoryRepository.addOnHand(productId, 5);
        });

        assertThat(fixtures.stock(productId)).isEqualTo(new StockLevels(15, 3, 12));
    }

    /**
     * Hibernate's AUTO flush already ensures this; flushAutomatically on the
     * repository makes it explicit.
     */
    @Test
    void pendingInventoryInsertIsFlushedBeforeABulkUpdateInTheSameTransaction() {
        Long productId = transactionTemplate.execute(status -> {
            Product product = productRepository.save(new Product("PC-" + UUID.randomUUID(), "Persistence context",
                    BigDecimal.ONE, 0, clock.instant()));
            inventoryRepository.save(new Inventory(product));
            assertThat(inventoryRepository.addOnHand(product.getId(), 5)).isEqualTo(1);
            return product.getId();
        });

        assertThat(fixtures.stock(productId)).isEqualTo(new StockLevels(5, 0, 5));
    }
}
