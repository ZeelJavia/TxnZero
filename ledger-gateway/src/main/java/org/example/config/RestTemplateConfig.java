package org.example.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Configuration for RestTemplate used in HTTP clients.
 * Provides timeout settings for external service calls.
 */
@Configuration
public class RestTemplateConfig {

    /**
     * Creates a RestTemplate bean with timeout configurations.
     * Used by SwitchClient to call the Switch service.
     *
     * @param builder RestTemplateBuilder provided by Spring Boot
     * @return Configured RestTemplate instance
     */
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(5))   // Time to establish connection
                .readTimeout(Duration.ofSeconds(30))     // Time to wait for response (payments can be slow)
                .build();
    }
}
