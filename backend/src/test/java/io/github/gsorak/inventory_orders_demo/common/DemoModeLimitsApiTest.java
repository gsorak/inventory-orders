package io.github.gsorak.inventory_orders_demo.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Products can only come from the demo catalogue here, so these tests use the
 * seed product LAMP-001.
 */
@TestPropertySource(properties = "app.demo.enabled=true")
class DemoModeLimitsApiTest extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbcTemplate;

    private long lampId() {
        return jdbcTemplate.queryForObject("SELECT id FROM product WHERE sku = 'LAMP-001'", Long.class);
    }

    private ResultActions postJson(String path, String json) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static void expectDemoRejection(ResultActions result) throws Exception {
        result.andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.detail").value(Matchers.startsWith("In the public demo, ")));
    }

    @Test
    void productPriceAndThresholdAreCapped() throws Exception {
        String product = """
                {"sku": "SSD-1TB", "name": "Portable SSD 1TB", "unitPrice": %s, "lowStockThreshold": %d}
                """;
        expectDemoRejection(postJson("/api/products", product.formatted("10000.01", 5)));
        expectDemoRejection(postJson("/api/products", product.formatted("199.00", 1001)));
        postJson("/api/products", product.formatted("10000.00", 1000)).andExpect(status().isCreated());
    }

    @Test
    void stockReceiptsAreCapped() throws Exception {
        expectDemoRejection(postJson("/api/products/" + lampId() + "/stock-receipts", "{\"quantity\": 1001}"));
        postJson("/api/products/" + lampId() + "/stock-receipts", "{\"quantity\": 1000}")
                .andExpect(status().isCreated());
    }

    @Test
    void reservationLinesAreCapped() throws Exception {
        expectDemoRejection(postJson("/api/reservations",
                "{\"items\": [{\"productId\": %d, \"quantity\": 21}]}".formatted(lampId())));
    }

    @Test
    void onlyTheSimulatedPaymentReferenceIsAccepted() throws Exception {
        String reservation = postJson("/api/reservations",
                "{\"items\": [{\"productId\": %d, \"quantity\": 20}]}".formatted(lampId()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long reservationId = JsonPath.parse(reservation).read("$.id", Long.class);

        expectDemoRejection(postJson("/api/reservations/" + reservationId + "/confirm",
                "{\"paymentReference\": \"Visit example.com\"}"));
        postJson("/api/reservations/" + reservationId + "/confirm",
                "{\"paymentReference\": \"SIM-%d\"}".formatted(reservationId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.paymentReference").value("SIM-" + reservationId));
    }
}
