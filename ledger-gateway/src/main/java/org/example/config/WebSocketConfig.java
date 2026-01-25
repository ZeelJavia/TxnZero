package org.example.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket configuration for real-time notifications. Uses STOMP protocol over
 * WebSocket for structured messaging.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Enable a simple in-memory message broker for broadcasting to clients
        // Clients subscribe to /topic/* destinations
        config.enableSimpleBroker("/topic", "/queue");

        // Prefix for messages FROM client TO server (application destinations)
        config.setApplicationDestinationPrefixes("/app");

        // User-specific destinations (for sending to specific users)
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // WebSocket endpoint that clients connect to
        registry.addEndpoint("/ws/notifications")
                .setAllowedOriginPatterns("*") // Allow all origins for dev - restrict in prod
                .withSockJS(); // Fallback for browsers without WebSocket support
    }
}
