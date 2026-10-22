package io.github.gsorak.inventory_orders_demo.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.UnsupportedEncodingException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryRepository;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.support.Concurrently;
import io.github.gsorak.inventory_orders_demo.support.Concurrently.Outcome;
import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Every task runs in its own thread and its own committed transaction, released
 * at the same instant.
 */
class ReservationConcurrencyTest extends IntegrationTest {

    @Autowired
    ReservationService reservationService;

    @Autowired
    InventoryRepository inventoryRepository;

    @Autowired
    TransactionTemplate transactionTemplate;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void concurrentCheckoutsNeverOversell() {
        long product = fixtures.createProduct("1.00", 10);

        List<Outcome<Long>> outcomes = Concurrently.run(40, i -> fixtures.reserve(product, 1));

        assertThat(outcomes.stream().filter(Outcome::succeeded)).hasSize(10);
        assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                .hasSize(30)
                .allMatch(outcome -> hasCode(outcome.error(), ErrorCode.INSUFFICIENT_STOCK));
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(10, 10, 0));
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void multiItemReservationsListedInOppositeOrdersStayAtomicWithoutDeadlock() {
        long plenty = fixtures.createProduct("1.00", 20);
        long scarce = fixtures.createProduct("1.00", 10);

        List<Outcome<Long>> outcomes = Concurrently.run(30, i -> {
            Map<Long, Integer> lines = new LinkedHashMap<>();
            if (i % 2 == 0) {
                lines.put(plenty, 1);
                lines.put(scarce, 1);
            } else {
                lines.put(scarce, 1);
                lines.put(plenty, 1);
            }
            return fixtures.reserve(lines);
        });

        assertThat(outcomes.stream().filter(Outcome::succeeded)).hasSize(10);
        assertThat(outcomes.stream().filter(outcome -> !outcome.succeeded()))
                .allMatch(outcome -> hasCode(outcome.error(), ErrorCode.INSUFFICIENT_STOCK));
        // Failed reservations rolled back the units they had already taken from the
        // plentiful product.
        assertThat(fixtures.stock(plenty)).isEqualTo(new StockLevels(20, 10, 10));
        assertThat(fixtures.stock(scarce)).isEqualTo(new StockLevels(10, 10, 0));
        invariants.assertInventoryConsistent(plenty);
        invariants.assertInventoryConsistent(scarce);
    }

    @Test
    void concurrentCancellationsReleaseStockExactlyOnce() {
        long product = fixtures.createProduct("1.00", 5);
        long reservationId = fixtures.reserve(product, 3);

        List<Outcome<ReservationResponse>> outcomes = Concurrently.run(10,
                i -> reservationService.cancel(reservationId));

        assertThat(outcomes).allMatch(Outcome::succeeded);
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 0, 5));
        invariants.assertInventoryConsistent(product);
    }

    @Test
    void concurrentFirstRequestsWithTheSameIdempotencyKeyCreateOneReservation() throws Exception {
        long product = fixtures.createProduct("1.00", 100);
        String key = UUID.randomUUID().toString();
        String body = "{\"items\": [{\"productId\": %d, \"quantity\": 2}]}".formatted(product);

        List<Outcome<MvcResult>> outcomes = Concurrently.run(8, i -> postReservation(key, body));

        assertThat(outcomes).allMatch(Outcome::succeeded);
        List<MvcResult> responses = outcomes.stream().map(Outcome::value).toList();
        List<MvcResult> created = responses.stream().filter(response -> statusOf(response) == 201).toList();
        assertThat(created).hasSize(1);
        long reservationId = idOf(created.getFirst());
        // Losers of the unique-key insert race get 409 DATA_CONFLICT; later arrivals
        // replay the winner.
        for (MvcResult response : responses) {
            if (statusOf(response) == 409) {
                assertThat((String) JsonPath.read(contentOf(response), "$.code")).isEqualTo("DATA_CONFLICT");
            } else {
                assertThat(statusOf(response)).isIn(200, 201);
                assertThat(idOf(response)).isEqualTo(reservationId);
            }
        }

        MvcResult retry = postReservation(key, body);
        assertThat(statusOf(retry)).isEqualTo(200);
        assertThat(idOf(retry)).isEqualTo(reservationId);
        assertThat(fixtures.stock(product).reserved()).isEqualTo(2);
        invariants.assertInventoryConsistent(product);
    }

    /**
     * Proves that the transactions genuinely overlap and the second one sees the
     * first one's committed result.
     */
    @Test
    void reservationWaitsForTheRowLockAndReevaluatesAvailabilityAfterTheOtherTransactionCommits()
            throws Exception {
        long product = fixtures.createProduct("1.00", 5);
        CountDownLatch rowLocked = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);

        CompletableFuture<Void> holder = CompletableFuture.runAsync(() -> transactionTemplate.executeWithoutResult(
                status -> {
                    assertThat(inventoryRepository.reserve(product, 5)).isEqualTo(1);
                    rowLocked.countDown();
                    await(allowCommit);
                }));
        assertThat(rowLocked.await(10, TimeUnit.SECONDS)).isTrue();

        CompletableFuture<Long> contender = CompletableFuture.supplyAsync(() -> fixtures.reserve(product, 1));
        awaitASessionBlockedByAnotherSession();
        assertThat(contender).as("second reservation must block on the row lock").isNotDone();

        allowCommit.countDown();
        holder.get(10, TimeUnit.SECONDS);

        assertThat(contender).failsWithin(10, TimeUnit.SECONDS)
                .withThrowableThat().havingRootCause()
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.code()).isEqualTo(ErrorCode.INSUFFICIENT_STOCK));
        assertThat(fixtures.stock(product)).isEqualTo(new StockLevels(5, 5, 0));
    }

    private static boolean hasCode(Throwable error, ErrorCode code) {
        return error instanceof BusinessException e && e.code() == code;
    }

    /**
     * Polls PostgreSQL until some session is waiting for a lock held by another
     * session.
     */
    private void awaitASessionBlockedByAnotherSession() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (jdbcTemplate.queryForObject("""
                SELECT count(*) FROM pg_stat_activity
                 WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0
                """, Integer.class) == 0) {
            assertThat(System.nanoTime()).as("no session started waiting for the row lock").isLessThan(deadline);
            Thread.sleep(10);
        }
    }

    private MvcResult postReservation(String idempotencyKey, String body) {
        try {
            return mockMvc.perform(post("/api/reservations").header("Idempotency-Key", idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static int statusOf(MvcResult result) {
        return result.getResponse().getStatus();
    }

    private static long idOf(MvcResult result) {
        return ((Number) JsonPath.read(contentOf(result), "$.id")).longValue();
    }

    private static String contentOf(MvcResult result) {
        try {
            return result.getResponse().getContentAsString();
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
