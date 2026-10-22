package io.github.gsorak.inventory_orders_demo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class InventoryOrdersDemoApplicationTests extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbcTemplate;

	@Test
	void contextLoads() {
	}

	@Test
	void flywayAppliedAllMigrationsOnStartup() {
		assertThat(jdbcTemplate.queryForList(
				"SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String.class))
				.containsExactly("1", "2");
	}

}
