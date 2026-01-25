package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Kafka event payload for real-time payment notifications. Published by Bank
 * after successful credit, consumed by Gateway for WebSocket push.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentNotificationEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Type of notification event
     */
    private EventType eventType;

    /**
     * Unique transaction ID
     */
    private String transactionId;

    /**
     * VPA of the receiver (used for routing WebSocket message)
     */
    private String receiverVpa;

    /**
     * VPA of the sender
     */
    private String senderVpa;

    /**
     * Display name of sender (if available)
     */
    private String senderName;

    /**
     * Transaction amount
     */
    private BigDecimal amount;

    /**
     * New balance after transaction (for receiver)
     */
    private BigDecimal newBalance;

    /**
     * Timestamp of the event
     */
    private Instant timestamp;

    /**
     * Human readable message
     */
    private String message;

    public enum EventType {
        PAYMENT_RECEIVED, // Money credited to account
        PAYMENT_SENT, // Confirmation that debit was successful
        PAYMENT_FAILED, // Payment failed
        PAYMENT_REVERSED     // Reversal processed
    }
}
