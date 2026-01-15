package org.example.controller;

import lombok.extern.slf4j.Slf4j;
import org.example.dto.PaymentRequest;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus; // Import your Enum

import org.example.service.FraudDetectionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/transactions")
@Slf4j
public class TransactionController {

    @Autowired
    private FraudDetectionService fraudService;

    @PostMapping("/initiate")
    public ResponseEntity<TransactionResponse> initiateTransaction(@RequestBody PaymentRequest request) {

        log.info("💸 Payment Request: {} -> {} | ₹{}",
                request.getPayerVpa(), request.getPayeeVpa(), request.getAmount());

        // Generate a Transaction ID (or use one if provided in request)
        String txnId = UUID.randomUUID().toString();

        // 1. Run Fraud Check
        double riskScore = fraudService.calculateRiskScore(request);

        // 2. Decision Gate
        if (riskScore > 0.85) {
            log.error("⛔ BLOCKED: Risk Score {}", riskScore);

            // Async Kill Switch
            CompletableFuture.runAsync(() ->
                    fraudService.blockMuleRing(request.getPayerVpa(), request.getPayeeVpa())
            );

            // 🛑 RETURN BLOCKED RESPONSE USING BUILDER
            TransactionResponse blockedResponse = TransactionResponse.builder()
                    .status(TransactionStatus.BLOCKED_FRAUD) // Use the Enum
                    .message("Transaction declined by AI Security Engine.")
                    .riskScore(riskScore)
                    .txnId(txnId)
                    .build();

            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(blockedResponse);
        }

        log.info("✅ APPROVED. Score: {}", riskScore);

        // ✅ RETURN SUCCESS RESPONSE USING BUILDER
        TransactionResponse successResponse = TransactionResponse.builder()
                .status(TransactionStatus.SUCCESS)
                .message("Payment processed successfully.")
                .riskScore(riskScore)
                .txnId(txnId)
                .build();

        return ResponseEntity.ok(successResponse);
    }
}