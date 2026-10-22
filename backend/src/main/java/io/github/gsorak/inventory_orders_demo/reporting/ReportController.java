package io.github.gsorak.inventory_orders_demo.reporting;

import java.time.Instant;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/low-stock")
    LowStockReport lowStock() {
        return reportService.lowStock();
    }

    @GetMapping("/inventory-aging")
    InventoryAgingReport inventoryAging() {
        return reportService.inventoryAging();
    }

    /** Defaults to the 30 days up to now. */
    @GetMapping("/order-cycle-time")
    OrderCycleTimeReport orderCycleTime(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return reportService.orderCycleTime(from, to);
    }
}
