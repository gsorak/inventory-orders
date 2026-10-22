package io.github.gsorak.inventory_orders_demo.fulfilment;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.SortedMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.CreationResult;
import io.github.gsorak.inventory_orders_demo.common.Idempotency;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryService;
import io.github.gsorak.inventory_orders_demo.order.CustomerOrder;
import io.github.gsorak.inventory_orders_demo.order.OrderService;

/**
 * Lock order in every method: the order row first (serializing all shipments of
 * the order and their order item
 * counters), then inventory rows in ascending product id order.
 */
@Service
public class FulfilmentService {

    private final ShipmentRepository shipmentRepository;
    private final OrderService orderService;
    private final InventoryService inventoryService;
    private final Clock clock;

    public FulfilmentService(ShipmentRepository shipmentRepository, OrderService orderService,
            InventoryService inventoryService, Clock clock) {
        this.shipmentRepository = shipmentRepository;
        this.orderService = orderService;
        this.inventoryService = inventoryService;
        this.clock = clock;
    }

    /**
     * Packing claims order quantities but does not touch inventory: the goods are
     * still in the warehouse.
     */
    @Transactional
    public CreationResult<ShipmentResponse> createShipment(long orderId, CreateShipmentRequest request,
            String idempotencyKey) {
        Idempotency.validateKey(idempotencyKey);
        SortedMap<Long, Integer> quantities = request.quantitiesByOrderItem();
        String fingerprint = idempotencyKey == null
                ? null
                : Idempotency.fingerprint("shipment:" + orderId + ":" + quantities);
        CustomerOrder order = orderService.lockOrder(orderId);

        if (idempotencyKey != null) {
            Optional<Shipment> previous = shipmentRepository.findByIdempotencyKey(idempotencyKey);
            if (previous.isPresent()) {
                Idempotency.requireSameRequest(idempotencyKey, previous.get().getRequestFingerprint(), fingerprint);
                return CreationResult.replayed(ShipmentResponse.of(previous.get()));
            }
        }

        Shipment shipment = Shipment.pack(order, quantities, clock.instant(), idempotencyKey, fingerprint);
        return CreationResult.created(ShipmentResponse.of(shipmentRepository.save(shipment)));
    }

    @Transactional(readOnly = true)
    public ShipmentResponse get(long shipmentId) {
        return ShipmentResponse.of(shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> BusinessException.notFound("Shipment", shipmentId)));
    }

    @Transactional(readOnly = true)
    public List<ShipmentResponse> listForOrder(long orderId) {
        orderService.requireExists(orderId);
        return shipmentRepository.findByOrder_IdOrderByIdAsc(orderId).stream().map(ShipmentResponse::of).toList();
    }

    /**
     * Shipped units leave on-hand and reserved stock together, so availability is
     * unchanged. Idempotent.
     */
    @Transactional
    public ShipmentResponse ship(long shipmentId) {
        Shipment shipment = loadUnderOrderLock(shipmentId);
        if (shipment.ship(clock.instant())) {
            inventoryService.removeShipped(shipment.quantitiesByProduct());
        }
        return ShipmentResponse.of(shipment);
    }

    /**
     * Delivery changes no inventory; it completes the order once every unit is
     * delivered. Idempotent.
     */
    @Transactional
    public ShipmentResponse deliver(long shipmentId) {
        Shipment shipment = loadUnderOrderLock(shipmentId);
        shipment.deliver(clock.instant());
        return ShipmentResponse.of(shipment);
    }

    /**
     * The shipment is read only after its order is locked, so its status is the
     * latest committed one.
     */
    private Shipment loadUnderOrderLock(long shipmentId) {
        long orderId = shipmentRepository.findOrderIdById(shipmentId)
                .orElseThrow(() -> BusinessException.notFound("Shipment", shipmentId));
        orderService.lockOrder(orderId);
        return shipmentRepository.findById(shipmentId).orElseThrow();
    }
}
