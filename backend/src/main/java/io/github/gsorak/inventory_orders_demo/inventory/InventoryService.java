package io.github.gsorak.inventory_orders_demo.inventory;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.DemoMode;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;

/**
 * Owns all inventory quantity changes. Methods taking a {@code SortedMap} of
 * product id to quantity update
 * inventory rows in ascending product id order, which is the global lock order
 * for inventory rows.
 */
@Service
public class InventoryService {

    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;
    private final StockReceiptRepository stockReceiptRepository;
    private final DemoProductCatalog demoCatalog;
    private final DemoMode demoMode;
    private final Clock clock;

    public InventoryService(ProductRepository productRepository, InventoryRepository inventoryRepository,
            StockReceiptRepository stockReceiptRepository, DemoProductCatalog demoCatalog, DemoMode demoMode,
            Clock clock) {
        this.productRepository = productRepository;
        this.inventoryRepository = inventoryRepository;
        this.stockReceiptRepository = stockReceiptRepository;
        this.demoCatalog = demoCatalog;
        this.demoMode = demoMode;
        this.clock = clock;
    }

    @Transactional
    public ProductResponse createProduct(CreateProductRequest request) {
        demoCatalog.requireAllowed(request.sku(), request.name());
        demoMode.requireProductLimits(request.unitPrice(), request.lowStockThreshold());
        if (productRepository.existsBySku(request.sku())) {
            throw new BusinessException(ErrorCode.ALREADY_EXISTS,
                    "A product with SKU %s already exists".formatted(request.sku()));
        }
        Product product = productRepository.save(new Product(request.sku(), request.name(), request.unitPrice(),
                request.lowStockThreshold(), clock.instant()));
        return ProductResponse.of(inventoryRepository.save(new Inventory(product)));
    }

    /** The catalogue entries not created yet; not found outside the public demo. */
    @Transactional(readOnly = true)
    public List<ProductTemplate> listAvailableTemplates() {
        if (!demoCatalog.isEnabled()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "The demo catalogue only exists in the public demo");
        }
        Set<String> existing = productRepository.findExistingSkus(
                demoCatalog.templates().stream().map(ProductTemplate::sku).toList());
        return demoCatalog.templates().stream().filter(t -> !existing.contains(t.sku())).toList();
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> listProducts() {
        return inventoryRepository.findAllWithProduct().stream().map(ProductResponse::of).toList();
    }

    @Transactional(readOnly = true)
    public ProductResponse getProduct(long productId) {
        return ProductResponse.of(findInventory(productId));
    }

    /**
     * Receipts are always timestamped with the current time, which keeps them in
     * chronological order for aging.
     */
    @Transactional
    public StockReceiptResponse receiveStock(long productId, int quantity) {
        demoMode.requireStockReceiptLimit(quantity);
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> BusinessException.notFound("Product", productId));
        StockReceipt receipt = addToOnHand(product, quantity, StockReceiptSource.PURCHASE, clock.instant());
        return new StockReceiptResponse(receipt.getId(), productId, receipt.getQuantity(), receipt.getSource(),
                receipt.getReceivedAt(), StockLevels.of(findInventory(productId)));
    }

    /**
     * All-or-nothing: if any product lacks stock, the exception rolls back the
     * reservations already made.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reserve(SortedMap<Long, Integer> quantitiesByProduct) {
        quantitiesByProduct.forEach((productId, quantity) -> {
            if (inventoryRepository.reserve(productId, quantity) == 0) {
                int available = inventoryRepository.findAvailableQuantity(productId)
                        .orElseThrow(() -> BusinessException.notFound("Product", productId));
                throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK,
                        "Insufficient stock for product %d: requested %d, available %d"
                                .formatted(productId, quantity, available),
                        Map.of("productId", productId, "requested", quantity, "available", available));
            }
        });
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void release(SortedMap<Long, Integer> quantitiesByProduct) {
        quantitiesByProduct.forEach((productId,
                quantity) -> requireUpdated(inventoryRepository.release(productId, quantity), "release", productId));
    }

    /**
     * Shipped units leave both on-hand and reserved stock, so availability does not
     * change.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void removeShipped(SortedMap<Long, Integer> quantitiesByProduct) {
        quantitiesByProduct.forEach((productId,
                quantity) -> requireUpdated(inventoryRepository.removeShipped(productId, quantity), "ship", productId));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void restockReturned(SortedMap<Long, Integer> quantitiesByProduct, Instant returnedAt) {
        quantitiesByProduct.forEach((productId, quantity) -> addToOnHand(
                productRepository.getReferenceById(productId), quantity, StockReceiptSource.RETURN, returnedAt));
    }

    private StockReceipt addToOnHand(Product product, int quantity, StockReceiptSource source, Instant receivedAt) {
        requireUpdated(inventoryRepository.addOnHand(product.getId(), quantity), "receive", product.getId());
        return stockReceiptRepository.save(new StockReceipt(product, quantity, source, receivedAt));
    }

    private Inventory findInventory(long productId) {
        return inventoryRepository.findWithProduct(productId)
                .orElseThrow(() -> BusinessException.notFound("Product", productId));
    }

    /**
     * A zero row count here means the caller's own bookkeeping is wrong; fail
     * loudly and roll back.
     */
    private static void requireUpdated(int updatedRows, String operation, long productId) {
        if (updatedRows != 1) {
            throw new IllegalStateException(
                    "Inventory invariant violated: cannot %s stock of product %d".formatted(operation, productId));
        }
    }
}
