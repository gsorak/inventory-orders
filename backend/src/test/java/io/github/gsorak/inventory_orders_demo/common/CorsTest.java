package io.github.gsorak.inventory_orders_demo.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

class CorsTest extends IntegrationTest {

    private static final String FRONTEND = "http://localhost:8081";

    @Test
    void preflightFromTheFrontendAllowsPostWithAnIdempotencyKey() throws Exception {
        mockMvc.perform(options("/api/reservations")
                .header(HttpHeaders.ORIGIN, FRONTEND)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type, idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND));
    }

    @Test
    void simpleRequestFromTheFrontendGetsTheAllowOriginHeader() throws Exception {
        mockMvc.perform(get("/api/products").header(HttpHeaders.ORIGIN, FRONTEND))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND));
    }

    @Test
    void theE2eTestOriginIsAllowed() throws Exception {
        mockMvc.perform(get("/api/products").header(HttpHeaders.ORIGIN, "http://localhost:8082"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:8082"));
    }

    @Test
    void otherOriginsAreRejected() throws Exception {
        mockMvc.perform(get("/api/products").header(HttpHeaders.ORIGIN, "http://evil.example"))
                .andExpect(status().isForbidden());
    }

    @Test
    void unsupportedMethodsAreNotAllowedCrossOrigin() throws Exception {
        mockMvc.perform(options("/api/products")
                .header(HttpHeaders.ORIGIN, FRONTEND)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "DELETE"))
                .andExpect(status().isForbidden());
    }
}
