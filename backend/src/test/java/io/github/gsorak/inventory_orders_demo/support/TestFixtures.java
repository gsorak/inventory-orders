package io.github.gsorak.inventory_orders_demo.support;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gsorak.inventory_orders_demo.fulfilment.CreateShipmentRequest;
import io.github.gsorak.inventory_orders_demo.fulfilment.FulfilmentService;
import io.github.gsorak.inventory_orders_demo.inventory.CreateProductRequest;
import io.github.gsorak.inventory_orders_demo.inventory.InventoryService;
import io.github.gsorak.inventory_orders_demo.inventory.StockLevels;
import io.github.gsorak.inventory_orders_demo.order.OrderResponse;
import io.github.gsorak.inventory_orders_demo.order.OrderService;
import io.github.gsorak.inventory_orders_demo.reservation.CreateReservationRequest;
import io.github.gsorak.inventory_orders_demo.reservation.ReservationService;

/**
 * Creates test data through the real services, so every fixture obeys the same
 * rules as production data.
 */
public class TestFixtures {

    private final InventoryService inventoryService;
    private final ReservationService reservationService;
    private final OrderService orderService;
    private final FulfilmentService fulfilmentService;

    public TestFixtures(InventoryService inventoryService, ReservationService reservationService,
            OrderService orderService, FulfilmentService fulfilmentService) {
        this.inventoryService = inventoryService;
        this.reservationService = reservationService;
        this.orderService = orderService;
        this.fulfilmentService = fulfilmentService;
    }

    public long createProduct(String unitPrice, int initialStock) {
        return createProduct(unitPrice, initialStock, 0);
    }

    public long createProduct(String unitPrice, int initialStock, int lowStockThreshold) {
        String sku = "TEST-" + UUID.randomUUID();
        long productId = inventoryService.createProduct(new CreateProductRequest(
                sku, "Product " + sku, new BigDecimal(unitPrice), lowStockThreshold)).id();
        if (initialStock > 0) {
            inventoryService.receiveStock(productId, initialStock);
        }
        return productId;
    }

    public StockLevels stock(long productId) {
        return inventoryService.getProduct(productId).stock();
    }

    public long reserve(long productId, int quantity) {
        return reserve(Map.of(productId, quantity));
    }

    /** Request lines are sent in the map's iteration order. */
    public long reserve(Map<Long, Integer> quantities) {
        return reservationService.create(reservationRequest(quantities), null).resource().id();
    }

    public static CreateReservationRequest reservationRequest(Map<Long, Integer> quantities) {
        List<CreateReservationRequest.Line> lines = quantities.entrySet().stream()
                .map(entry -> new CreateReservationRequest.Line(entry.getKey(), entry.getValue()))
                .toList();
        return new CreateReservationRequest(lines);
    }

    public OrderResponse confirm(long reservationId) {
        return orderService.confirmPayment(reservationId, "PAY-" + UUID.randomUUID()).resource();
    }

    public OrderResponse placeOrder(Map<Long, Integer> quantities) {
        return confirm(reserve(quantities));
    }

    public OrderResponse order(long orderId) {
        return orderService.get(orderId);
    }

    /** Packs the given quantities per order item id. */
    public long pack(long orderId, Map<Long, Integer> quantitiesByOrderItem) {
        List<CreateShipmentRequest.Line> lines = quantitiesByOrderItem.entrySet().stream()
                .map(entry -> new CreateShipmentRequest.Line(entry.getKey(), entry.getValue()))
                .toList();
        return fulfilmentService.createShipment(orderId, new CreateShipmentRequest(lines), null).resource().id();
    }

    /** Packs, ships and delivers the given quantities in one shipment. */
    public long deliver(long orderId, Map<Long, Integer> quantitiesByOrderItem) {
        long shipmentId = pack(orderId, quantitiesByOrderItem);
        fulfilmentService.ship(shipmentId);
        fulfilmentService.deliver(shipmentId);
        return shipmentId;
    }
}
