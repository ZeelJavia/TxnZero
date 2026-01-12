package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "transactions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SwitchTransaction {

    @Id
    @Column(name = "global_txn_id")
    private String globalTxnId;

    @Column(name = "payer_vpa", nullable = false)
    private String payerVpa;

    @Column(name = "payee_vpa", nullable = false)
    private String payeeVpa;

    @Column(nullable = false)
    private BigDecimal amount;

    // Routing
    @Column(name = "payer_bank")
    private String payerBank;

    @Column(name = "payee_bank")
    private String payeeBank;

    // Fraud Signals
    @Column(name = "sender_ip")
    private String senderIp;

    @Column(name = "sender_device_id")
    private String senderDeviceId;

    // ML Output
    @Column(name = "ml_fraud_score")
    private BigDecimal mlFraudScore;

    @Column(name = "risk_flag")
    private String riskFlag; // 'SAFE', 'REVIEW', 'BLOCK'

    private String status; // SUCCESS, FAILED

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}