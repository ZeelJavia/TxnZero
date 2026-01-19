package org.example.controller;

import org.example.dto.*;
import org.example.enums.TransactionStatus;
import org.example.service.AccountLinkService;
import org.example.service.FraudDetectionService; // ✅ 1. Import FraudService
import org.example.service.RouterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.concurrent.CompletableFuture;

/**
 * REST Controller for Switch routing operations.
 * Port: 9090
 */
@RestController
@RequestMapping("/api/switch")
public class RouterController {

    private static final Logger log = LoggerFactory.getLogger(RouterController.class);

    private final RouterService routerService;
    private final AccountLinkService accountLinkService;
    private final FraudDetectionService fraudService; // ✅ 2. Inject Service
    private final RestTemplate restTemplate;

    public RouterController(RouterService routerService,
                            AccountLinkService accountLinkService,
                            FraudDetectionService fraudService,
                            RestTemplate restTemplate) {
        this.routerService = routerService;
        this.accountLinkService = accountLinkService;
        this.fraudService = fraudService;
        this.restTemplate = restTemplate;
    }

    @PostMapping("/transfer")
    public ResponseEntity<TransactionResponse> transfer(@RequestBody PaymentRequest request) {

        log.info("Received transfer request: txnId={}, payer={}, payee={}, amount={}",
                request.getTxnId(), request.getPayerVpa(), request.getPayeeVpa(), request.getAmount());

        // Validate required fields
        if (request.getTxnId() == null || request.getTxnId().isBlank()) {
            return ResponseEntity.badRequest().body(TransactionResponse.builder()
                    .status(TransactionStatus.FAILED).message("Transaction ID is required").build());
        }
        if (request.getPayerVpa() == null || request.getPayeeVpa() == null) {
            return ResponseEntity.badRequest().body(TransactionResponse.builder()
                    .txnId(request.getTxnId()).status(TransactionStatus.FAILED)
                    .message("Payer and Payee VPA are required").build());
        }

        // Delegate to RouterService (It calls FraudService internally to check score)
        TransactionResponse response = routerService.routeTransaction(request);

        // ✅ 3. HANDLE FRAUD BLOCKING
        if (response.getStatus() == TransactionStatus.BLOCKED_FRAUD) {
            log.error("⛔ TRANSACTION BLOCKED AS FRAUD: {}", response.getTxnId());

            // A. Trigger the Mule Ring Takedown (Async)
            // This calls the Gateway to set isTrusted = false and disable the users
            CompletableFuture.runAsync(() ->
                    fraudService.blockMuleRing(request.getPayerVpa(), request.getPayeeVpa())
            );

            // B. Sync this "Bad Edge" to the Graph so the AI learns
            triggerGraphSync();
        }
        // ✅ 4. HANDLE SUCCESS SYNC
        else if (response.getStatus() == TransactionStatus.SUCCESS) {
            triggerGraphSync();
        }

        log.info("Transfer complete: txnId={}, status={}, riskScore={}",
                response.getTxnId(), response.getStatus(), response.getRiskScore());

        return ResponseEntity.ok(response);
    }

    // Helper Method for Fire-and-Forget Call
    private void triggerGraphSync() {
        CompletableFuture.runAsync(() -> {
            try {
                // If Switch is Local & Python is Docker -> "http://localhost:8000"
                // If both in Docker -> "http://sync-engine:8000"
                String url = "http://localhost:8000/sync/transactions";
                restTemplate.postForLocation(url, null);
                log.info("🚀 Triggered Graph Sync for transaction");
            } catch (Exception e) {
                log.warn("⚠️ Failed to trigger Graph Sync: {}", e.getMessage());
            }
        });
    }


    @GetMapping("/vpa/{vpa}/bank")
    public ResponseEntity<String> lookupVpaBank(@PathVariable String vpa) {
        log.info("VPA lookup request: {}", vpa);
        String bankHandle = routerService.lookupBankForVpa(vpa);
        if (bankHandle == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(bankHandle);
    }

    @GetMapping("/banks")
    public Response getBanks() {
        return accountLinkService.getAllBanks();
    }

    @PostMapping("/account-exits")
    public Response getExitsBank(@RequestBody BankClientReq req){
        return accountLinkService.getAccount(req);
    }

    @PostMapping("/vpa-generate")
    public Response generateVpaBank(@RequestBody BankClientReq req){
        return accountLinkService.generateVPA(req);
    }

    @PostMapping("/set-mpin")
    public Response setMPinBank(@RequestBody PinBankReq req){
        return accountLinkService.setMpin(req);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Switch is UP");
    }
}