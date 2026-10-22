package io.github.gsorak.inventory_orders_demo.inventory;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final InventoryService inventoryService;

    public ProductController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @PostMapping
    ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody CreateProductRequest request) {
        ProductResponse product = inventoryService.createProduct(request);
        return ResponseEntity.created(URI.create("/api/products/" + product.id())).body(product);
    }

    @GetMapping
    List<ProductResponse> listProducts() {
        return inventoryService.listProducts();
    }

    @GetMapping("/demo-catalog")
    List<ProductTemplate> listDemoCatalog() {
        return inventoryService.listAvailableTemplates();
    }

    @GetMapping("/{productId}")
    ProductResponse getProduct(@PathVariable long productId) {
        return inventoryService.getProduct(productId);
    }

    @PostMapping("/{productId}/stock-receipts")
    ResponseEntity<StockReceiptResponse> receiveStock(@PathVariable long productId,
            @Valid @RequestBody ReceiveStockRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.receiveStock(productId, request.quantity()));
    }
}
