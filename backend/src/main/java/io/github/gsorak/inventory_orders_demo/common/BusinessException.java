package io.github.gsorak.inventory_orders_demo.common;

import java.util.Map;

/**
 * A violated business rule. Thrown inside a transaction, it rolls the whole
 * transaction back.
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode code;
    private final Map<String, Object> details;

    public BusinessException(ErrorCode code, String message) {
        this(code, message, Map.of());
    }

    public BusinessException(ErrorCode code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = Map.copyOf(details);
    }

    public static BusinessException notFound(String resource, Object id) {
        return new BusinessException(ErrorCode.NOT_FOUND, "%s %s not found".formatted(resource, id));
    }

    public ErrorCode code() {
        return code;
    }

    public Map<String, Object> details() {
        return details;
    }
}
