package io.github.gsorak.inventory_orders_demo.inventory;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class ProductApiTest extends IntegrationTest {

        @Test
        void createdProductStartsWithNoStock() throws Exception {
                String sku = "SKU-" + UUID.randomUUID();
                mockMvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content("""
                                {"sku": "%s", "name": "Desk lamp", "unitPrice": 39.90, "lowStockThreshold": 5}
                                """.formatted(sku)))
                                .andExpect(status().isCreated())
                                .andExpect(header().exists("Location"))
                                .andExpect(jsonPath("$.sku").value(sku))
                                .andExpect(jsonPath("$.unitPrice").value(39.90))
                                .andExpect(jsonPath("$.stock.onHand").value(0))
                                .andExpect(jsonPath("$.stock.reserved").value(0))
                                .andExpect(jsonPath("$.stock.available").value(0));
        }

        @Test
        void demoCatalogueDoesNotExistOutsideThePublicDemo() throws Exception {
                mockMvc.perform(get("/api/products/demo-catalog"))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }

        @Test
        void duplicateSkuIsRejected() throws Exception {
                String body = """
                                {"sku": "SKU-%s", "name": "Chair", "unitPrice": 10.00, "lowStockThreshold": 0}
                                """.formatted(UUID.randomUUID());
                mockMvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content(body))
                                .andExpect(status().isCreated());
                mockMvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content(body))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
        }

        @Test
        void invalidProductIsRejectedWithFieldErrors() throws Exception {
                mockMvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content("""
                                {"sku": "", "name": "Chair", "unitPrice": 0, "lowStockThreshold": -1}
                                """))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.errors.length()").value(3));
        }

        @Test
        void receivingStockIncreasesOnHandAndAvailable() throws Exception {
                long productId = fixtures.createProduct("5.00", 10);

                mockMvc.perform(post("/api/products/{id}/stock-receipts", productId)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\": 5}"))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.source").value("PURCHASE"))
                                .andExpect(jsonPath("$.quantity").value(5))
                                .andExpect(jsonPath("$.stock.onHand").value(15))
                                .andExpect(jsonPath("$.stock.available").value(15));

                mockMvc.perform(get("/api/products/{id}", productId))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.stock.onHand").value(15))
                                .andExpect(jsonPath("$.stock.reserved").value(0));
        }

        @Test
        void receivingStockRequiresPositiveQuantity() throws Exception {
                long productId = fixtures.createProduct("5.00", 0);
                mockMvc.perform(post("/api/products/{id}/stock-receipts", productId)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\": 0}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }

        @Test
        void unknownProductIsNotFound() throws Exception {
                mockMvc.perform(get("/api/products/{id}", Long.MAX_VALUE))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
                mockMvc.perform(post("/api/products/{id}/stock-receipts", Long.MAX_VALUE)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\": 1}"))
                                .andExpect(status().isNotFound());
        }

        @Test
        void listIncludesStockLevels() throws Exception {
                long productId = fixtures.createProduct("5.00", 3);
                mockMvc.perform(get("/api/products"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[?(@.id == %d)].stock.onHand".formatted(productId)).value(3));
        }
}
