package org.example.service.imp;

import org.example.config.KafkaConsumerConfig;
import org.example.dto.PaymentNotificationEvent;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class PaymentNotificationProducer {

    private final KafkaTemplate<String, PaymentNotificationEvent> kafkaTemplate;

    public PaymentNotificationProducer(KafkaTemplate<String, PaymentNotificationEvent> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publish(PaymentNotificationEvent event) {
        kafkaTemplate.send(KafkaConsumerConfig.PAYMENT_EVENTS_TOPIC, event.getReceiverVpa(), event);
    }
}
