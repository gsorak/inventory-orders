package io.github.gsorak.inventory_orders_demo.reservation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import io.github.gsorak.inventory_orders_demo.common.BusinessException;
import io.github.gsorak.inventory_orders_demo.common.ErrorCode;
import io.github.gsorak.inventory_orders_demo.inventory.Product;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;

/**
 * Stock held for a checkout. Expiry has two steps:
 * <ul>
 * <li><b>Logical expiry</b>: once {@code now >= expiresAt} the reservation can
 * no longer be confirmed or cancelled
 * and is reported as EXPIRED, even though the stored status is still
 * ACTIVE.</li>
 * <li><b>Physical release</b>: the expiry sweeper later stores status EXPIRED
 * and returns the stock to
 * availability, recording {@code stockReleasedAt}. Until then the stock stays
 * reserved.</li>
 * </ul>
 * State changes must be made on an instance loaded with a row lock (see
 * {@link ReservationRepository}).
 */
@Entity
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String idempotencyKey;

    private String requestFingerprint;

    @Enumerated(EnumType.STRING)
    private ReservationStatus status;

    private Instant createdAt;

    private Instant expiresAt;

    private Instant confirmedAt;

    private Instant stockReleasedAt;

    @OneToMany(mappedBy = "reservation", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<ReservationItem> items = new ArrayList<>();

    protected Reservation() {
    }

    public Reservation(Instant createdAt, Instant expiresAt, String idempotencyKey, String requestFingerprint) {
        this.status = ReservationStatus.ACTIVE;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.idempotencyKey = idempotencyKey;
        this.requestFingerprint = requestFingerprint;
    }

    public void addItem(Product product, int quantity) {
        items.add(new ReservationItem(this, product, quantity));
    }

    /**
     * The status clients see: an ACTIVE reservation past its expiry time is already
     * EXPIRED.
     */
    public ReservationStatus effectiveStatus(Instant now) {
        return status == ReservationStatus.ACTIVE && !now.isBefore(expiresAt) ? ReservationStatus.EXPIRED : status;
    }

    /** @return false if already confirmed (a repeated request) */
    public boolean confirm(Instant now) {
        if (status == ReservationStatus.CONFIRMED) {
            return false;
        }
        requireOpen(now, "confirm");
        status = ReservationStatus.CONFIRMED;
        confirmedAt = now;
        return true;
    }

    /**
     * @return true if the caller must release the stock; false if already cancelled
     *         (a repeated request)
     */
    public boolean cancel(Instant now) {
        if (status == ReservationStatus.CANCELLED) {
            return false;
        }
        requireOpen(now, "cancel");
        status = ReservationStatus.CANCELLED;
        stockReleasedAt = now;
        return true;
    }

    /**
     * @return true if the caller must release the stock; false if not due or no
     *         longer active
     */
    public boolean expire(Instant now) {
        if (status != ReservationStatus.ACTIVE || now.isBefore(expiresAt)) {
            return false;
        }
        status = ReservationStatus.EXPIRED;
        stockReleasedAt = now;
        return true;
    }

    /** Ascending product id order: the global lock order for inventory rows. */
    public SortedMap<Long, Integer> quantitiesByProduct() {
        SortedMap<Long, Integer> quantities = new TreeMap<>();
        items.forEach(item -> quantities.merge(item.getProduct().getId(), item.getQuantity(), Integer::sum));
        return Collections.unmodifiableSortedMap(quantities);
    }

    private void requireOpen(Instant now, String action) {
        switch (effectiveStatus(now)) {
            case ACTIVE -> {
            }
            case EXPIRED -> throw new BusinessException(ErrorCode.RESERVATION_EXPIRED,
                    "Cannot %s reservation %d: it expired at %s".formatted(action, id, expiresAt));
            default -> throw new BusinessException(ErrorCode.INVALID_STATE_TRANSITION,
                    "Cannot %s reservation %d: it is %s".formatted(action, id, status));
        }
    }

    public Long getId() {
        return id;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public Instant getStockReleasedAt() {
        return stockReleasedAt;
    }

    public List<ReservationItem> getItems() {
        return Collections.unmodifiableList(items);
    }
}
