package org.example.service;

import org.example.config.KafkaProducerConfig;
import org.example.dto.PaymentNotificationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;

/**
 * Service for publishing payment notification events to Kafka. These events are
 * consumed by Gateway for real-time WebSocket notifications. Only enabled when
 * kafka.enabled=true
 */
@Service
@ConditionalOnProperty(name = "kafka.enabled", havingValue = "true", matchIfMissing = false)
public class PaymentNotificationProducer {

    private static final Logger log = LoggerFactory.getLogger(PaymentNotificationProducer.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PaymentNotificationProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Publish a payment received notification (after successful credit). Uses
     * receiverVpa as the key for partition routing - ensures all events for
     * same user go to same partition.
     */
    public void publishPaymentReceived(String transactionId, String receiverVpa, String senderVpa,
            BigDecimal amount, BigDecimal newBalance) {
        PaymentNotificationEvent event = PaymentNotificationEvent.builder()
                .eventType(PaymentNotificationEvent.EventType.PAYMENT_RECEIVED)
                .transactionId(transactionId)
                .receiverVpa(receiverVpa)
                .senderVpa(senderVpa)
                .amount(amount)
                .newBalance(newBalance)
                .timestamp(Instant.now())
                .message(String.format("Received ₹%.2f from %s", amount, senderVpa))
                .build();

        sendEvent(receiverVpa, event);
    }

    /**
     * Publish a payment sent confirmation (after successful debit).
     */
    public void publishPaymentSent(String transactionId, String senderVpa, String receiverVpa,
            BigDecimal amount, BigDecimal newBalance) {
        PaymentNotificationEvent event = PaymentNotificationEvent.builder()
                .eventType(PaymentNotificationEvent.EventType.PAYMENT_SENT)
                .transactionId(transactionId)
                .receiverVpa(senderVpa) // Notification goes to sender
                .senderVpa(senderVpa)
                .amount(amount)
                .newBalance(newBalance)
                .timestamp(Instant.now())
                .message(String.format("Sent ₹%.2f to %s", amount, receiverVpa))
                .build();

        sendEvent(senderVpa, event);
    }

    /**
     * Publish a payment failed notification.
     */
    public void publishPaymentFailed(String transactionId, String vpa, String reason) {
        PaymentNotificationEvent event = PaymentNotificationEvent.builder()
                .eventType(PaymentNotificationEvent.EventType.PAYMENT_FAILED)
                .transactionId(transactionId)
                .receiverVpa(vpa)
                .timestamp(Instant.now())
                .message("Payment failed: " + reason)
                .build();

        sendEvent(vpa, event);
    }

    /**
     * Send event to Kafka asynchronously.
     */
    private void sendEvent(String key, PaymentNotificationEvent event) {
        log.info("Publishing payment notification: type={}, txnId={}, targetVpa={}",
                event.getEventType(), event.getTransactionId(), event.getReceiverVpa());

        CompletableFuture<SendResult<String, Object>> future
                = kafkaTemplate.send(KafkaProducerConfig.PAYMENT_EVENTS_TOPIC, key, event);

        future.whenComplete((result, ex) -> {
            if (ex == null) {
                log.debug("Notification sent successfully: txnId={}, partition={}, offset={}",
                        event.getTransactionId(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                log.error("Failed to send notification: txnId={}, error={}",
                        event.getTransactionId(), ex.getMessage());
                // In production, you might want to save failed events to a dead-letter table
            }
        });
    }
}
