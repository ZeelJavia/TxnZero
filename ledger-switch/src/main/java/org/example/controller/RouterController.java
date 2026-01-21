package org.example.controller;

import org.example.client.BankClient;
import org.example.dto.*;
import org.example.enums.TransactionStatus;
import org.example.service.AccountLinkService;
import org.example.service.RouterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate; // ✅ Added

import java.security.PublicKey;
import java.util.concurrent.CompletableFuture; // ✅ Added

/**
 * REST Controller for Switch routing operations. Port: 9090
 */
@RestController
@RequestMapping("/api/switch")
public class RouterController {

    private static final Logger log = LoggerFactory.getLogger(RouterController.class);

    private final RouterService routerService;
    private final AccountLinkService accountLinkService;

    // ✅ 1. Inject RestTemplate
    private final RestTemplate restTemplate;

    public RouterController(RouterService routerService,
            AccountLinkService accountLinkService,
            RestTemplate restTemplate) {
        this.routerService = routerService;
        this.accountLinkService = accountLinkService;
        this.restTemplate = restTemplate;
    }

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

        // ✅ 2. TRIGGER GRAPH SYNC (Only on Success)
        // We do this HERE to ensure DB transaction is committed before Python reads it.
        if (response.getStatus() == TransactionStatus.SUCCESS) {
            triggerGraphSync();
        }

        log.info("Transfer complete: txnId={}, status={}, riskScore={}",
                response.getTxnId(), response.getStatus(), response.getRiskScore());

        return ResponseEntity.ok(response);
    }

    // ✅ 3. Helper Method for Fire-and-Forget Call
    private void triggerGraphSync() {
        CompletableFuture.runAsync(() -> {
            try {
                // If Switch is Local & Python is Docker -> "http://localhost:8000"
                // If both in Docker -> "http://sync-engine:8000"
                String url = "http://localhost:8000/sync/transactions";
                restTemplate.postForLocation(url, null);
                log.info("🚀 Triggered Graph Sync for successful transaction");
            } catch (Exception e) {
                log.warn("⚠️ Failed to trigger Graph Sync: {}", e.getMessage());
            }
        });
    }

    // ... [Rest of the Controller remains unchanged] ...
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
    public Response getExitsBank(@RequestBody BankClientReq req) {
        return accountLinkService.getAccount(req);
    }

    @PostMapping("/vpa-generate")
    public Response generateVpaBank(@RequestBody BankClientReq req) {
        return accountLinkService.generateVPA(req);
    }

    @PostMapping("/set-mpin")
    public Response setMPinBank(@RequestBody PinBankReq req) {
        return accountLinkService.setMpin(req);
    }

    /**
     * Get account balance for a VPA. Gateway calls this, Switch routes to
     * appropriate bank.
     */
    @GetMapping("/balance/{vpa}")
    public ResponseEntity<BalanceResponse> getBalance(@PathVariable String vpa) {
        log.info("Balance inquiry request for VPA: {}", vpa);

        BalanceResponse response = accountLinkService.getBalanceForVpa(vpa);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }

    /**
     * Get transaction history for a VPA. Gateway calls this, Switch routes to
     * appropriate bank.
     */
    @GetMapping("/transactions/{vpa}")
    public ResponseEntity<Response> getTransactionHistory(
            @PathVariable String vpa,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int limit) {
        log.info("Transaction history request for VPA: {}, page={}, limit={}", vpa, page, limit);

        Response response = accountLinkService.getTransactionHistoryForVpa(vpa, page, limit);
        return ResponseEntity.ok(response);
    }

    /**
     * Get all linked accounts for a user (by phone number). Returns list of
     * VPAs with their bank info and balances.
     */
    @GetMapping("/accounts/{phoneNumber}")
    public ResponseEntity<Response> getLinkedAccounts(@PathVariable String phoneNumber) {
        log.info("Linked accounts request for phone: {}", phoneNumber);

        Response response = accountLinkService.getLinkedAccountsForPhone(phoneNumber);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Switch is UP");
    }
}
