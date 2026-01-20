package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Immutable ledger entry for audit trail.
 * Every debit/credit creates a new entry - never updated.
 */
@Entity
@Table(name = "account_ledger", indexes = {
        @Index(name = "idx_ledger_account", columnList = "account_number"),
        @Index(name = "idx_ledger_txn", columnList = "global_txn_id")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountLedger {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ledger_id")
    private Long ledgerId;

    @Column(name = "global_txn_id", nullable = false)
    private String globalTxnId;

    @Column(name = "account_number", nullable = false)
    private String accountNumber;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LedgerDirection direction;

    @Column(name = "counterparty_vpa")
    private String counterpartyVpa;

    @Column(name = "balance_after", nullable = false)
    private BigDecimal balanceAfter;

    @Column(name = "risk_score")
    private BigDecimal riskScore;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    /**
     * Ledger entry direction.
     */
    public enum LedgerDirection {
        DEBIT, CREDIT
    }
}