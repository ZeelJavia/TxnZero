package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.enums.TransactionStatus;

/**
 * Data Transfer Object for transaction responses.
 * Returned from Switch to Gateway after processing.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransactionResponse {

    /**
     * Transaction status enum.
     * SUCCESS, FAILED, BLOCKED_FRAUD, PENDING, etc.
     */
    private TransactionStatus status;

    /**
     * ML-computed risk score.
     * Range: 0.0 (safe) to 1.0 (high risk).
     */
    private Double riskScore;

    /**
     * Human-readable message.
     * e.g., "Payment Successful" or "Insufficient Funds"
     */
    private String message;

    /**
     * Transaction ID for reference.
     */
    private String txnId;
}