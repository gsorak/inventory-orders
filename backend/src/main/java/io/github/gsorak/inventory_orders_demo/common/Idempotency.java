package io.github.gsorak.inventory_orders_demo.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Support for the optional {@code Idempotency-Key} request header. The key is
 * stored in a unique column of the
 * created resource together with a SHA-256 fingerprint of the canonical
 * request. A repeated key with the same
 * request replays the original result; a repeated key with a different request
 * is rejected.
 */
public final class Idempotency {

    public static final String HEADER = "Idempotency-Key";

    private static final int MAX_KEY_LENGTH = 100;

    private Idempotency() {
    }

    public static void validateKey(String key) {
        if (key != null && (key.isBlank() || key.length() > MAX_KEY_LENGTH)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST,
                    "%s must be 1 to %d characters".formatted(HEADER, MAX_KEY_LENGTH));
        }
    }

    /**
     * {@code canonicalRequest} must be identical for semantically identical
     * requests (e.g. sorted lines).
     */
    public static String fingerprint(String canonicalRequest) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(canonicalRequest.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }

    public static void requireSameRequest(String key, String originalFingerprint, String fingerprint) {
        if (!originalFingerprint.equals(fingerprint)) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_REUSED,
                    "%s '%s' was already used for a different request".formatted(HEADER, key));
        }
    }
}
