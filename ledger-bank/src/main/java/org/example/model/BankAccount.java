package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "accounts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BankAccount {

    @Id
    @Column(name = "account_number")
    private String accountNumber;

    @Column(name = "user_name")
    private String userName;

    @Column(name = "current_balance")
    private BigDecimal currentBalance;

    @Column(name = "avg_monthly_balance")
    private BigDecimal avgMonthlyBalance; // Baseline for ML

    @Column(name = "frozen_status")
    private boolean frozenStatus = false; // True if ML detects Money Laundering

    // Note: Added this field so we can actually verify the PIN
    @Column(name = "mpin_hash")
    private String mpinHash;
}