package io.github.gsorak.inventory_orders_demo.inventory;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Each test uses its own catalogue entries, since an entry can only be created
 * once per database.
 */
@TestPropertySource(properties = "app.demo.enabled=true")
class DemoProductCatalogApiTest extends IntegrationTest {

    private ResultActions create(String sku, String name) throws Exception {
        return mockMvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content("""
                {"sku": "%s", "name": "%s", "unitPrice": 19.99, "lowStockThreshold": 3}
                """.formatted(sku, name)));
    }

    @Test
    void createdCatalogueEntryIsNoLongerAvailable() throws Exception {
        mockMvc.perform(get("/api/products/demo-catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.sku == 'KB-MECH')].name").value("Mechanical keyboard"));

        create("KB-MECH", "Mechanical keyboard")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value("KB-MECH"))
                .andExpect(jsonPath("$.unitPrice").value(19.99));

        mockMvc.perform(get("/api/products/demo-catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].sku", Matchers.not(Matchers.hasItem("KB-MECH"))))
                .andExpect(jsonPath("$[*].sku", Matchers.hasItem("MON-27")));
        create("KB-MECH", "Mechanical keyboard")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
    }

    @Test
    void freeTextProductsAreRejected() throws Exception {
        create("FREE-1", "Anything at all")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void catalogueSkuWithAnotherNameIsRejected() throws Exception {
        create("CAM-HD", "Something else")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        create("cam-hd", "HD webcam")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void stockCanBeReceivedForACatalogueProduct() throws Exception {
        String body = create("HUB-USBC", "USB-C hub").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long id = JsonPath.parse(body).read("$.id", Long.class);

        mockMvc.perform(post("/api/products/{id}/stock-receipts", id)
                .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\": 4}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stock.available").value(4));
    }
}
