package org.example.enums;

/**
 * Enum representing the lifecycle status of a transaction.
 * Used across Gateway, Switch, and Bank modules.
 */
public enum TransactionStatus {

    /**
     * Transaction initiated, waiting for bank processing.
     */
    PENDING,

    /**
     * Transaction completed successfully.
     * Money debited from sender and credited to receiver.
     */
    SUCCESS,

    /**
     * Transaction failed due to bank rejection.
     * Reasons: Insufficient balance, Invalid PIN, Account blocked.
     */
    FAILED,

    /**
     * Transaction blocked by ML Fraud Detection.
     * High risk score detected before reaching bank.
     */
    BLOCKED_FRAUD,

    /**
     * Timeout scenario - Debit successful, Credit pending.
     * Money deducted from sender, awaiting credit confirmation.
     * Background job will retry or reverse.
     */
    DEEMED_APPROVED,

    /**
     * Transaction was reversed/refunded.
     * Used when credit fails after successful debit.
     */
    REVERSED
}
