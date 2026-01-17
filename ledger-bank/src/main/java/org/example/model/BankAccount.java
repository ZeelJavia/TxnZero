package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Core banking account entity.
 * Uses @Version for optimistic locking to prevent concurrent balance updates.
 */
@Entity
@Table(name = "accounts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankAccount {

    @Id
    @Column(name = "account_number")
    private String accountNumber;

    @Column(name = "phone_number")
    private String phoneNumber;

    @Column(name = "user_name")
    private String userName;

    @Column(name = "current_balance", nullable = false)
    private BigDecimal currentBalance;


//    @Builder.Default
    @Column(name = "frozen_status")
    private Boolean frozenStatus = false; // True if ML detects Money Laundering

    @Column(name = "mpin_hash")
    private String mpinHash;

    @Column(name = "salt")
    private String salt;

    /**
     * Version field for optimistic locking.
     * JPA will automatically check and increment this on each update.
     * Throws OptimisticLockException if concurrent modification detected.
     */
    @Version
    @Column(name = "version")
    private Long version;

    /**
     * Debits amount from account balance.
     * @param amount Amount to debit
     * @throws IllegalStateException if insufficient balance
     */
    public void debit(BigDecimal amount) {
        if (currentBalance.compareTo(amount) < 0) {
            throw new IllegalStateException("Insufficient balance");
        }
        this.currentBalance = this.currentBalance.subtract(amount);
    }

    /**
     * Credits amount to account balance.
     * @param amount Amount to credit
     */
    public void credit(BigDecimal amount) {
        this.currentBalance = this.currentBalance.add(amount);
    }
}