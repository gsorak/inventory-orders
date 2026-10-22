package io.github.gsorak.inventory_orders_demo.reporting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.Inventory;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryRepository;
import io.github.gsorak.inventory_orders_demo.inventory.StockReceipt;
import io.github.gsorak.inventory_orders_demo.inventory.StockReceiptRepository;
import io.github.gsorak.inventory_orders_demo.order.OrderRepository;

/**
 * Read-only reports. REPEATABLE_READ gives each report one consistent snapshot
 * across its queries, without
 * taking locks that would block checkouts.
 */
@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReportService {

    private static final Duration DEFAULT_CYCLE_TIME_WINDOW = Duration.ofDays(30);
    private static final BigDecimal SECONDS_PER_HOUR = BigDecimal.valueOf(3600);

    private final InventoryRepository inventoryRepository;
    private final StockReceiptRepository stockReceiptRepository;
    private final OrderRepository orderRepository;
    private final Clock clock;

    public ReportService(InventoryRepository inventoryRepository, StockReceiptRepository stockReceiptRepository,
            OrderRepository orderRepository, Clock clock) {
        this.inventoryRepository = inventoryRepository;
        this.stockReceiptRepository = stockReceiptRepository;
        this.orderRepository = orderRepository;
        this.clock = clock;
    }

    public LowStockReport lowStock() {
        return new LowStockReport(inventoryRepository.findAtOrBelowLowStockThreshold().stream()
                .map(inventory -> new LowStockReport.Item(inventory.getProductId(), inventory.getProduct().getSku(),
                        inventory.getProduct().getName(), inventory.getOnHand(), inventory.getReserved(),
                        inventory.getAvailable(), inventory.getProduct().getLowStockThreshold()))
                .toList());
    }

    /**
     * Receipts are only ever timestamped with the current time, and on-hand stock
     * only decreases by shipping. So
     * under FIFO the units still on hand are exactly the newest receipts adding up
     * to the on-hand quantity
     * (on_hand = Σ receipts − Σ shipped guarantees the receipts cover it).
     */
    public InventoryAgingReport inventoryAging() {
        Instant now = clock.instant();
        List<Inventory> inStock = inventoryRepository.findAllInStock();
        if (inStock.isEmpty()) {
            return new InventoryAgingReport(now, InventoryAgingReport.METHOD, List.of());
        }
        Map<Long, List<StockReceipt>> receiptsNewestFirst = stockReceiptRepository
                .findNewestFirst(inStock.stream().map(Inventory::getProductId).toList()).stream()
                .collect(Collectors.groupingBy(receipt -> receipt.getProduct().getId()));
        List<InventoryAgingReport.Item> items = inStock.stream()
                .map(inventory -> agingOf(inventory, receiptsNewestFirst.getOrDefault(inventory.getProductId(),
                        List.of()), now))
                .toList();
        return new InventoryAgingReport(now, InventoryAgingReport.METHOD, items);
    }

    public OrderCycleTimeReport orderCycleTime(Instant from, Instant to) {
        Instant end = to != null ? to : clock.instant();
        Instant start = from != null ? from : end.minus(DEFAULT_CYCLE_TIME_WINDOW);
        if (!start.isBefore(end)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "'from' must be before 'to'");
        }
        List<Duration> cycleTimes = orderRepository.findDeliveredBetween(start, end).stream()
                .map(order -> Duration.between(order.getConfirmedAt(), order.getDeliveredAt()))
                .sorted()
                .toList();
        if (cycleTimes.isEmpty()) {
            return new OrderCycleTimeReport(start, end, 0, null, null, null, null, null);
        }
        int count = cycleTimes.size();
        Duration total = cycleTimes.stream().reduce(Duration.ZERO, Duration::plus);
        Duration median = count % 2 == 1
                ? cycleTimes.get(count / 2)
                : cycleTimes.get(count / 2 - 1).plus(cycleTimes.get(count / 2)).dividedBy(2);
        Duration p90 = cycleTimes.get((int) Math.ceil(0.9 * count) - 1);
        return new OrderCycleTimeReport(start, end, count, hours(total.dividedBy(count)), hours(median), hours(p90),
                hours(cycleTimes.getFirst()), hours(cycleTimes.getLast()));
    }

    private static InventoryAgingReport.Item agingOf(Inventory inventory, List<StockReceipt> receiptsNewestFirst,
            Instant now) {
        int[] buckets = new int[4];
        long unitDays = 0;
        long oldestAgeDays = 0;
        int unattributed = inventory.getOnHand();
        for (StockReceipt receipt : receiptsNewestFirst) {
            if (unattributed == 0) {
                break;
            }
            int units = Math.min(unattributed, receipt.getQuantity());
            long ageDays = Duration.between(receipt.getReceivedAt(), now).toDays();
            buckets[bucketIndex(ageDays)] += units;
            unitDays += units * ageDays;
            oldestAgeDays = ageDays;
            unattributed -= units;
        }
        int attributed = inventory.getOnHand() - unattributed;
        BigDecimal averageAge = attributed == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(unitDays).divide(BigDecimal.valueOf(attributed), 1, RoundingMode.HALF_UP);
        return new InventoryAgingReport.Item(inventory.getProductId(), inventory.getProduct().getSku(),
                inventory.getProduct().getName(), inventory.getOnHand(),
                new InventoryAgingReport.AgeBuckets(buckets[0], buckets[1], buckets[2], buckets[3]),
                averageAge, oldestAgeDays);
    }

    private static int bucketIndex(long ageDays) {
        if (ageDays <= 30) {
            return 0;
        }
        if (ageDays <= 60) {
            return 1;
        }
        return ageDays <= 90 ? 2 : 3;
    }

    private static BigDecimal hours(Duration duration) {
        return BigDecimal.valueOf(duration.toSeconds()).divide(SECONDS_PER_HOUR, 2, RoundingMode.HALF_UP);
    }
}
