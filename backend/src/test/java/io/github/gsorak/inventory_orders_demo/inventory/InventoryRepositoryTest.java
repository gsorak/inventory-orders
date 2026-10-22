package io.github.gsorak.inventory_orders_demo.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class InventoryRepositoryTest extends IntegrationTest {

    @Autowired
    InventoryRepository inventoryRepository;

    @Autowired
    TransactionTemplate transactionTemplate;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void conditionalReserveUpdatesNothingWhenStockIsInsufficient() {
        long productId = fixtures.createProduct("1.00", 3);

        int first = transactionTemplate.execute(status -> inventoryRepository.reserve(productId, 2));
        int second = transactionTemplate.execute(status -> inventoryRepository.reserve(productId, 2));

        assertThat(first).isEqualTo(1);
        assertThat(second).isZero();
        assertThat(fixtures.stock(productId)).isEqualTo(new StockLevels(3, 2, 1));
    }

    @Test
    void releaseAndShipNeverDriveReservedBelowZero() {
        long productId = fixtures.createProduct("1.00", 3);

        Integer released = transactionTemplate.execute(status -> inventoryRepository.release(productId, 1));
        Integer shipped = transactionTemplate.execute(status -> inventoryRepository.removeShipped(productId, 1));

        assertThat(released).isZero();
        assertThat(shipped).isZero();
        assertThat(fixtures.stock(productId)).isEqualTo(new StockLevels(3, 0, 3));
    }

    @Test
    void databaseRejectsReservedAboveOnHandEvenForUnconditionalUpdates() {
        long productId = fixtures.createProduct("1.00", 3);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE inventory SET reserved = on_hand + 1 WHERE product_id = ?", productId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(fixtures.stock(productId)).isEqualTo(new StockLevels(3, 0, 3));
    }
}
