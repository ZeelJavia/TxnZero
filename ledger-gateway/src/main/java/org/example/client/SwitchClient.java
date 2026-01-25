package org.example.client;

import org.example.dto.*;
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

import javax.swing.plaf.PanelUI;

/**
 * HTTP Client for communication with Ledger Switch service. Handles all
 * outbound calls from Gateway to Switch (Port 9090).
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
     * Initiates a payment transfer via the Switch service. This is the main
     * entry point for Gateway → Switch communication.
     *
     * @param request The payment request containing payer, payee, amount, and
     * fraud data
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
     * get all Available banks list see all banks into dropdown menu user select
     * ones
     */
    public Response getAllBanks() {
        String url = switchBaseUrl + "/api/switch/banks";
        ResponseEntity<Response> response = restTemplate.getForEntity(url, Response.class);
        return response.getBody();
    }

    /**
     * check phoneNo is connected to bank account or not
     */
    public Response accountIsExits(BankClientReq req) {
        String url = switchBaseUrl + "/api/switch/account-exits";
        ResponseEntity<Response> response = restTemplate.postForEntity(url, req, Response.class);
        return response.getBody();
    }

    /**
     * call Switch to generate vpa and get account number
     *
     */
    public Response VPAGenerate(BankClientReq req) {
        String url = switchBaseUrl + "/api/switch/vpa-generate";
        ResponseEntity<Response> response = restTemplate.postForEntity(url, req, Response.class);
        return response.getBody();
    }

    /**
     *
     * set mpin
     *
     */
    public Response setMPin(PinBankReq req) {
        String url = switchBaseUrl + "/api/switch/set-mpin";
        ResponseEntity<Response> response = restTemplate.postForEntity(url, req, Response.class);
        return response.getBody();
    }

    /**
     * Get balance for a VPA. Routes through Switch to appropriate bank.
     */
    public BalanceResponse getBalance(String vpa) {
        String url = switchBaseUrl + "/api/switch/balance/" + vpa;
        log.info("Getting balance for VPA: {}", vpa);
        try {
            ResponseEntity<BalanceResponse> response = restTemplate.getForEntity(url, BalanceResponse.class);
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to get balance for VPA {}: {}", vpa, e.getMessage());
            return null;
        }
    }

    /**
     * Get transaction history for a VPA. Routes through Switch to appropriate
     * bank.
     */
    public Response getTransactionHistory(String vpa, int page, int limit) {
        String url = switchBaseUrl + "/api/switch/transactions/" + vpa + "?page=" + page + "&limit=" + limit;
        log.info("Getting transaction history for VPA: {}", vpa);
        try {
            ResponseEntity<Response> response = restTemplate.getForEntity(url, Response.class);
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to get transaction history for VPA {}: {}", vpa, e.getMessage());
            return new Response("Failed to get transaction history", 500, e.getMessage(), null);
        }
    }

    public Response getTransactionHistory(String vpa) {
        String url = switchBaseUrl + "/api/switch/transactions-graph/" + vpa;
        log.info("Getting transaction history for VPA: {}", vpa);
        try {
            ResponseEntity<Response> response = restTemplate.getForEntity(url, Response.class);
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to get transaction history for VPA {}: {}", vpa, e.getMessage());
            return new Response("Failed to get transaction history", 500, e.getMessage(), null);
        }
    }

    /**
     * Get all linked accounts for a phone number. Routes through Switch to get
     * all VPAs and their balances.
     */
    public Response getLinkedAccounts(String phoneNumber) {
        String url = switchBaseUrl + "/api/switch/accounts/" + phoneNumber;
        log.info("Getting linked accounts for phone: {}", phoneNumber);
        try {
            ResponseEntity<Response> response = restTemplate.getForEntity(url, Response.class);
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to get linked accounts for phone {}: {}", phoneNumber, e.getMessage());
            return new Response("Failed to get linked accounts", 500, e.getMessage(), null);
        }
    }

    /**
     * Health check for Switch service. Used for monitoring and circuit breaker
     * logic.
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
