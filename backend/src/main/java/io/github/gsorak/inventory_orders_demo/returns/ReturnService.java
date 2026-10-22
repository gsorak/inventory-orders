package io.github.gsorak.inventory_orders_demo.returns;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.Idempotency;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryService;
import io.github.gsorak.inventory_orders_demo.order.CustomerOrder;
import io.github.gsorak.inventory_orders_demo.order.OrderService;

/**
 * Lock order: the order row first, then inventory rows (restocking) in
 * ascending product id order.
 */
@Service
public class ReturnService {

    private final OrderReturnRepository orderReturnRepository;
    private final OrderService orderService;
    private final InventoryService inventoryService;
    private final Clock clock;

    public ReturnService(OrderReturnRepository orderReturnRepository, OrderService orderService,
            InventoryService inventoryService, Clock clock) {
        this.orderReturnRepository = orderReturnRepository;
        this.orderService = orderService;
        this.inventoryService = inventoryService;
        this.clock = clock;
    }

    /**
     * Records the return, applies each line's disposition, issues a credit note and
     * reduces the order's net total.
     * Restocked units become on-hand and available again (as a RETURN stock
     * receipt); discarded units do not.
     */
    @Transactional
    public CreationResult<ReturnResponse> createReturn(long orderId, CreateReturnRequest request,
            String idempotencyKey) {
        Idempotency.validateKey(idempotencyKey);
        String fingerprint = idempotencyKey == null
                ? null
                : Idempotency.fingerprint("return:" + orderId + ":" + request.canonicalForm());
        CustomerOrder order = orderService.lockOrder(orderId);

        if (idempotencyKey != null) {
            Optional<OrderReturn> previous = orderReturnRepository.findByIdempotencyKey(idempotencyKey);
            if (previous.isPresent()) {
                Idempotency.requireSameRequest(idempotencyKey, previous.get().getRequestFingerprint(), fingerprint);
                return CreationResult.replayed(ReturnResponse.of(previous.get()));
            }
        }

        Instant now = clock.instant();
        OrderReturn orderReturn = new OrderReturn(order, now, idempotencyKey, fingerprint);
        request.items().forEach(line -> orderReturn.addItem(
                order.item(line.orderItemId()), line.quantity(), line.reason(), line.condition()));
        orderReturn.issueCreditNote();
        orderReturnRepository.save(orderReturn);
        inventoryService.restockReturned(orderReturn.restockQuantitiesByProduct(), now);
        return CreationResult.created(ReturnResponse.of(orderReturn));
    }

    @Transactional(readOnly = true)
    public ReturnResponse get(long returnId) {
        return ReturnResponse.of(orderReturnRepository.findById(returnId)
                .orElseThrow(() -> BusinessException.notFound("Return", returnId)));
    }

    @Transactional(readOnly = true)
    public List<ReturnResponse> listForOrder(long orderId) {
        orderService.requireExists(orderId);
        return orderReturnRepository.findByOrder_IdOrderByIdAsc(orderId).stream().map(ReturnResponse::of).toList();
    }
}
