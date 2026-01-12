package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "account_ledger")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountLedger {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ledger_id")
    private Long ledgerId;

    @Column(name = "account_number")
    private String accountNumber;

    private BigDecimal amount;

    private String direction; // 'DEBIT' or 'CREDIT'

    @Column(name = "other_party_vpa")
    private String otherPartyVpa;

    @Column(name = "risk_score_received")
    private BigDecimal riskScoreReceived;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}