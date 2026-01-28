package org.example.service.imp;

import org.example.config.KafkaConsumerConfig;
import org.example.dto.PaymentNotificationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/**
 * Kafka consumer for payment notification events. Listens to
 * payment.notifications topic and pushes messages to WebSocket clients. Only
 * enabled when kafka.enabled=true
 */
@Service
@ConditionalOnProperty(name = "kafka.enabled", havingValue = "true", matchIfMissing = false)
public class PaymentNotificationConsumer {

    private static final Logger log = LoggerFactory.getLogger(PaymentNotificationConsumer.class);

    private final SimpMessagingTemplate messagingTemplate;

    public PaymentNotificationConsumer(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Consume payment notification events from Kafka and push to WebSocket.
     * Messages are routed to user-specific destinations based on VPA.
     */
    @KafkaListener(
            topics = KafkaConsumerConfig.PAYMENT_EVENTS_TOPIC,
            groupId = "${spring.kafka.consumer.group-id:gateway-notification-group}"
    )
    public void handlePaymentNotification(PaymentNotificationEvent event) {
        log.info("Received payment notification: type={}, txnId={}, targetVpa={}",
                event.getEventType(), event.getTransactionId(), event.getReceiverVpa());

        try {
            // Send to user-specific topic based on VPA
            // Frontend subscribes to: /topic/notifications/{vpa}
            String destination = "/topic/notifications/" + event.getReceiverVpa();

            messagingTemplate.convertAndSend(destination, event);

            log.debug("Pushed notification to WebSocket: destination={}", destination);

        } catch (Exception e) {
            log.error("Failed to push notification to WebSocket: txnId={}, error={}",
                    event.getTransactionId(), e.getMessage());
        }
    }
}
