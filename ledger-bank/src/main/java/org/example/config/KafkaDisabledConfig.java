package org.example.config;

import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration to exclude Kafka auto-configuration when kafka.enabled=false.
 * This prevents Kafka from trying to connect when not needed.
 */
@Configuration
@ConditionalOnProperty(name = "kafka.enabled", havingValue = "false", matchIfMissing = true)
@EnableAutoConfiguration(exclude = KafkaAutoConfiguration.class)
public class KafkaDisabledConfig {
    // This config excludes Kafka auto-configuration when kafka.enabled=false
}
