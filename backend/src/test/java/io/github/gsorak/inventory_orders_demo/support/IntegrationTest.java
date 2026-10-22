package io.github.gsorak.inventory_orders_demo.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Base class for full-stack tests. Tests are deliberately not
 * {@code @Transactional}: every service call commits
 * a real transaction, so concurrency tests exercise genuine database locking.
 * Tests share one database, so each
 * test creates its own products and orders and only asserts on those.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({ PostgresTestcontainersConfig.class, TestClockConfig.class, TestFixtures.class, InvariantChecks.class })
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected TestFixtures fixtures;

    @Autowired
    protected InvariantChecks invariants;
}
