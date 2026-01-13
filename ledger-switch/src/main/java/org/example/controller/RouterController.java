package org.example.controller;

import org.example.dto.PaymentRequest;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus;
import org.example.service.RouterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST Controller for Switch routing operations.
 * Receives payment requests from Gateway and routes to appropriate banks.
 * 
 * Port: 9090
 */
@RestController
@RequestMapping("/api/switch")
public class RouterController {

    private static final Logger log = LoggerFactory.getLogger(RouterController.class);

    private final RouterService routerService;

    public RouterController(RouterService routerService) {
        this.routerService = routerService;
    }

    /**
     * Main transfer endpoint.
     * Called by Gateway's SwitchClient.
     *
     * POST /api/switch/transfer
     *
     * Flow:
     * 1. Receive PaymentRequest from Gateway
     * 2. Lookup VPA → Bank mapping
     * 3. Run fraud detection
     * 4. If safe, route to payer's bank for debit
     * 5. Then route to payee's bank for credit
     * 6. Return final status
     *
     * @param request Payment request containing txnId, amount, VPAs, fraud data
     * @return TransactionResponse with final status and risk score
     */
    @PostMapping("/transfer")
    public ResponseEntity<TransactionResponse> transfer(@RequestBody PaymentRequest request) {

        log.info("Received transfer request: txnId={}, payer={}, payee={}, amount={}",
                request.getTxnId(),
                request.getPayerVpa(),
                request.getPayeeVpa(),
                request.getAmount());

        // Validate required fields
        if (request.getTxnId() == null || request.getTxnId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Transaction ID is required")
                            .build()
            );
        }

        if (request.getPayerVpa() == null || request.getPayeeVpa() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .txnId(request.getTxnId())
                            .status(TransactionStatus.FAILED)
                            .message("Payer and Payee VPA are required")
                            .build()
            );
        }

        // Delegate to RouterService
        TransactionResponse response = routerService.routeTransaction(request);

        log.info("Transfer complete: txnId={}, status={}, riskScore={}",
                response.getTxnId(), response.getStatus(), response.getRiskScore());

        return ResponseEntity.ok(response);
    }

    /**
     * VPA lookup endpoint.
     * Returns bank handle for a given VPA.
     *
     * GET /api/switch/vpa/{vpa}/bank
     */
    @GetMapping("/vpa/{vpa}/bank")
    public ResponseEntity<String> lookupVpaBank(@PathVariable String vpa) {
        log.info("VPA lookup request: {}", vpa);

        String bankHandle = routerService.lookupBankForVpa(vpa);
        if (bankHandle == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(bankHandle);
    }

    /**
     * Health check endpoint for Switch service.
     */
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Switch is UP");
    }
}
