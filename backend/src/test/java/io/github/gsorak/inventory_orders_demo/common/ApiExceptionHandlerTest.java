package io.github.gsorak.inventory_orders_demo.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

@WebMvcTest(controllers = ApiExceptionHandlerTest.ProbeController.class)
@Import(ApiExceptionHandlerTest.ProbeController.class)
class ApiExceptionHandlerTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void businessRuleViolationIsRenderedAsProblemDetailWithCodeAndDetails() throws Exception {
        mockMvc.perform(get("/probe/business"))
                .andExpect(status().isConflict())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"))
                .andExpect(jsonPath("$.detail").value("Not enough stock"))
                .andExpect(jsonPath("$.productId").value(7));
    }

    @Test
    void invalidRequestBodyListsFieldViolations() throws Exception {
        mockMvc.perform(post("/probe/validated").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"\", \"quantity\": 0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.length()").value(2));
    }

    @Test
    void malformedJsonIsBadRequest() throws Exception {
        mockMvc.perform(post("/probe/validated").contentType(MediaType.APPLICATION_JSON).content("{oops"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void lockConflictIsRetryableConflict() throws Exception {
        mockMvc.perform(get("/probe/lock"))
                .andExpect(status().isConflict())
                .andExpect(header().string("Retry-After", "1"))
                .andExpect(jsonPath("$.code").value("LOCK_CONFLICT"))
                .andExpect(jsonPath("$.retryable").value(true));
    }

    @Test
    void unexpectedErrorDoesNotLeakInternals() throws Exception {
        mockMvc.perform(get("/probe/unexpected"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"));
    }

    record ProbeRequest(@NotBlank String name, @Positive int quantity) {
    }

    @RestController
    static class ProbeController {

        @GetMapping("/probe/business")
        void business() {
            throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK, "Not enough stock", Map.of("productId", 7));
        }

        @PostMapping("/probe/validated")
        void validated(@Valid @RequestBody ProbeRequest request) {
        }

        @GetMapping("/probe/lock")
        void lock() {
            throw new CannotAcquireLockException("Timeout trying to lock table");
        }

        @GetMapping("/probe/unexpected")
        void unexpected() {
            throw new IllegalStateException("internal secret");
        }
    }
}
