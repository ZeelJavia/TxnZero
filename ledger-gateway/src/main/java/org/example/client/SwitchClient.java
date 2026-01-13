package org.example.client;

import org.example.dto.PaymentRequest;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

/**
 * HTTP Client for communication with Ledger Switch service.
 * Handles all outbound calls from Gateway to Switch (Port 9090).
 */
@Component
public class SwitchClient {

    private static final Logger log = LoggerFactory.getLogger(SwitchClient.class);

    private final RestTemplate restTemplate;
    private final String switchBaseUrl;

    public SwitchClient(RestTemplate restTemplate,
                        @Value("${app.urls.switch}") String switchBaseUrl) {
        this.restTemplate = restTemplate;
        this.switchBaseUrl = switchBaseUrl;
    }

    /**
     * Initiates a payment transfer via the Switch service.
     * This is the main entry point for Gateway → Switch communication.
     *
     * @param request The payment request containing payer, payee, amount, and fraud data
     * @return TransactionResponse with status and risk score
     */
    public TransactionResponse initiateTransfer(PaymentRequest request) {
        String url = switchBaseUrl + "/api/switch/transfer";

        log.info("Calling Switch service for txnId: {}", request.getTxnId());

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<PaymentRequest> entity = new HttpEntity<>(request, headers);

            ResponseEntity<TransactionResponse> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    TransactionResponse.class
            );

            log.info("Switch response for txnId {}: {}", request.getTxnId(), response.getStatusCode());
            return response.getBody();

        } catch (HttpClientErrorException e) {
            // 4xx errors (Bad Request, Unauthorized, etc.)
            log.error("Client error calling Switch for txnId {}: {}", request.getTxnId(), e.getMessage());
            return TransactionResponse.builder()
                    .txnId(request.getTxnId())
                    .status(TransactionStatus.FAILED)
                    .message("Request rejected: " + e.getStatusCode())
                    .build();

        } catch (HttpServerErrorException e) {
            // 5xx errors (Switch is down or errored)
            log.error("Server error from Switch for txnId {}: {}", request.getTxnId(), e.getMessage());
            return TransactionResponse.builder()
                    .txnId(request.getTxnId())
                    .status(TransactionStatus.PENDING)
                    .message("Switch service error. Transaction pending.")
                    .build();

        } catch (ResourceAccessException e) {
            // Network timeout / Switch unreachable
            log.error("Timeout/Connection error to Switch for txnId {}: {}", request.getTxnId(), e.getMessage());
            return TransactionResponse.builder()
                    .txnId(request.getTxnId())
                    .status(TransactionStatus.PENDING)
                    .message("Switch unreachable. Transaction will be retried.")
                    .build();
        }
    }

    /**
     * Health check for Switch service.
     * Used for monitoring and circuit breaker logic.
     *
     * @return true if Switch is reachable
     */
    public boolean isHealthy() {
        try {
            String url = switchBaseUrl + "/actuator/health";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.warn("Switch health check failed: {}", e.getMessage());
            return false;
        }
    }
}
