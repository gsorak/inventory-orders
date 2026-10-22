package io.github.gsorak.inventory_orders_demo.common;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.persistence.LockTimeoutException;
import jakarta.persistence.PessimisticLockException;

/**
 * Renders every error as an RFC 9457 problem detail with a machine-readable
 * {@code code} property.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    record FieldViolation(String field, String message) {
    }

    @ExceptionHandler(BusinessException.class)
    ProblemDetail handleBusinessRule(BusinessException exception) {
        ProblemDetail problem = problem(exception.code(), exception.getMessage());
        exception.details().forEach(problem::setProperty);
        return problem;
    }

    /**
     * Lock timeouts and detected deadlocks: the transaction was rolled back and can
     * safely be retried.
     */
    @ExceptionHandler({ ConcurrencyFailureException.class, PessimisticLockException.class, LockTimeoutException.class })
    ResponseEntity<ProblemDetail> handleLockConflict(Exception exception) {
        log.warn("Lock conflict, transaction rolled back: {}", exception.getMessage());
        ProblemDetail problem = problem(ErrorCode.LOCK_CONFLICT,
                "The resource is being modified concurrently; retry the request");
        problem.setProperty("retryable", true);
        return ResponseEntity.status(ErrorCode.LOCK_CONFLICT.status())
                .header(HttpHeaders.RETRY_AFTER, "1")
                .body(problem);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException exception) {
        log.warn("Data integrity violation, transaction rolled back: {}",
                exception.getMostSpecificCause().getMessage());
        return problem(ErrorCode.DATA_CONFLICT, "The request conflicts with the current state of the data");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail handleUnexpected(Exception exception) {
        log.error("Unexpected error", exception);
        return problem(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> violations = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldViolation(error.getField(), error.getDefaultMessage()))
                .toList();
        ProblemDetail problem = exception.getBody();
        problem.setDetail("Request validation failed");
        problem.setProperty("code", ErrorCode.VALIDATION_FAILED.name());
        problem.setProperty("errors", violations);
        return handleExceptionInternal(exception, problem, headers, status, request);
    }

    /** Constraint violations on query parameters, e.g. an out-of-range page size. */
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException exception, HttpHeaders headers, HttpStatusCode status,
            WebRequest request) {
        List<FieldViolation> violations = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new FieldViolation(result.getMethodParameter().getParameterName(),
                                error.getDefaultMessage())))
                .toList();
        ProblemDetail problem = exception.getBody();
        problem.setDetail("Request validation failed");
        problem.setProperty("code", ErrorCode.VALIDATION_FAILED.name());
        problem.setProperty("errors", violations);
        return handleExceptionInternal(exception, problem, headers, status, request);
    }

    /**
     * Adds a {@code code} to the problem details Spring MVC creates for its own
     * exceptions.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body, HttpHeaders headers,
            HttpStatusCode statusCode, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(exception, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem
                && (problem.getProperties() == null || !problem.getProperties().containsKey("code"))) {
            HttpStatus status = HttpStatus.resolve(statusCode.value());
            problem.setProperty("code", status != null ? status.name() : "ERROR");
        }
        return response;
    }

    private static ProblemDetail problem(ErrorCode code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(code.status(), detail);
        problem.setProperty("code", code.name());
        return problem;
    }
}
