package io.github.gsorak.inventory_orders_demo.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;

import io.github.gsorak.inventory_orders_demo.support.IntegrationTest;

/**
 * Settings of the AWS deployment (profiles demo,aws as in the ECS task): the
 * load balancer health check and CORS
 * disabled without any environment variable (the browser reaches the API on the
 * same CloudFront origin).
 */
@ActiveProfiles({ "demo", "aws" })
class DeploymentConfigurationTest extends IntegrationTest {

    @Test
    void readinessAndLivenessProbesAreUp() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", true));
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk());
    }

    @Test
    void healthShowsNoDetails() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    @Test
    void noOtherActuatorEndpointIsExposed() throws Exception {
        for (String endpoint : new String[] { "env", "configprops", "beans", "info", "metrics", "loggers",
                "heapdump" }) {
            mockMvc.perform(get("/actuator/" + endpoint)).andExpect(status().isNotFound());
        }
    }

    @Test
    void withoutAllowedOriginsRequestsCarryingAnOriginAreServedWithoutCorsHeaders() throws Exception {
        String origin = "https://d111111abcdef8.cloudfront.net";
        mockMvc.perform(get("/api/products").header(HttpHeaders.ORIGIN, origin))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        mockMvc.perform(post("/api/products/0/stock-receipts").header(HttpHeaders.ORIGIN, origin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\": 1}"))
                .andExpect(status().isNotFound())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void theDevelopmentOriginsDoNotApply() throws Exception {
        mockMvc.perform(get("/api/products").header(HttpHeaders.ORIGIN, "http://localhost:8081"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    // 14-verify-frontend.sh sends this preflight and expects no grant.
    @Test
    void preflightFromAnotherSiteIsNotGranted() throws Exception {
        mockMvc.perform(options("/api/reservations")
                .header(HttpHeaders.ORIGIN, "https://cors-check.invalid")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type, idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS));
    }
}
