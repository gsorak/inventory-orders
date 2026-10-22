package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.util.List;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Runs what scripts/reset-demo-data.sh runs, inside a transaction that is
 * rolled back, so the shared test database
 * keeps its data.
 */
class DemoDataResetTest extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    DataSource dataSource;

    @Autowired
    PlatformTransactionManager transactionManager;

    @Test
    void resetEmptiesEveryTableAndReloadsTheSampleData() {
        fixtures.createProduct("5.00", 3);

        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            Connection connection = DataSourceUtils.getConnection(dataSource);
            ScriptUtils.executeSqlScript(connection,
                    new FileSystemResource(Path.of("scripts", "reset-demo-data.sql")));

            List<String> tables = jdbcTemplate.queryForList("""
                    SELECT table_name FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                       AND table_name <> 'flyway_schema_history'
                    """, String.class);
            assertThat(tables).isNotEmpty().allSatisfy(table -> assertThat(
                    jdbcTemplate.queryForObject("SELECT count(*) FROM " + table, Long.class))
                    .as(table).isZero());

            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V2__sample_data.sql"));
            List<Long> productIds = jdbcTemplate.queryForList("SELECT id FROM product", Long.class);
            List<Long> orderIds = jdbcTemplate.queryForList("SELECT id FROM customer_order", Long.class);
            assertThat(productIds).hasSize(5);
            assertThat(orderIds).hasSize(2);
            productIds.forEach(invariants::assertInventoryConsistent);
            orderIds.forEach(invariants::assertOrderItemsConsistent);

            tx.setRollbackOnly();
        });
    }
}
