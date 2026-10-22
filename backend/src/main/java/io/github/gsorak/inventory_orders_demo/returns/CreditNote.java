package io.github.gsorak.inventory_orders_demo.returns;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;

/**
 * A simulated credit note; no money moves. Its number is derived from its id.
 */
@Entity
public class CreditNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "return_id")
    private OrderReturn orderReturn;

    private BigDecimal amount;

    private Instant issuedAt;

    protected CreditNote() {
    }

    CreditNote(OrderReturn orderReturn, BigDecimal amount, Instant issuedAt) {
        this.orderReturn = orderReturn;
        this.amount = amount;
        this.issuedAt = issuedAt;
    }

    public String number() {
        return "CN-%06d".formatted(id);
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }
}
