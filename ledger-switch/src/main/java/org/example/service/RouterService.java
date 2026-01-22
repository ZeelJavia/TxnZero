package org.example.service;

import org.example.client.BankClient;
import org.example.dto.PaymentRequest;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus;
import org.example.model.SwitchTransaction;
import org.example.model.VPARegistry;
import org.example.repository.SwitchTransactionRepository;
import org.example.repository.VPARegistryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional; // ✅ Import Spring Transactional
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@Service
public class RouterService {

    private static final Logger log = LoggerFactory.getLogger(RouterService.class);
    private static final double FRAUD_THRESHOLD = 0.75;

    private final VPARegistryRepository vpaRegistryRepository;
    private final SwitchTransactionRepository transactionRepository;
    private final FraudDetectionService fraudDetectionService;
    private final BankClient bankClient;

    private final RestTemplate restTemplate = new RestTemplate();

    public RouterService(VPARegistryRepository vpaRegistryRepository,
                         SwitchTransactionRepository transactionRepository,
                         FraudDetectionService fraudDetectionService,
                         BankClient bankClient) {
        this.vpaRegistryRepository = vpaRegistryRepository;
        this.transactionRepository = transactionRepository;
        this.fraudDetectionService = fraudDetectionService;
        this.bankClient = bankClient;
    }

    /**
     * Main Payment Routing Logic.
     * ❌ WRITER: Writes multiple transaction updates -> PRIMARY
     */
    @Transactional
    public TransactionResponse routeTransaction(PaymentRequest request) {

        String txnId = request.getTxnId();
        log.info("Routing transaction: {}", txnId);

        // Step 1: Payer/Payee Lookup (Reads from Primary to ensure consistency during txn)
        Optional<VPARegistry> payerVpaOpt = vpaRegistryRepository.findByVpa(request.getPayerVpa());
        if (payerVpaOpt.isEmpty()) return buildFailedResponse(txnId, "Payer VPA not registered");
        VPARegistry payerVpa = payerVpaOpt.get();
        if (payerVpa.isBlacklisted()) return buildBlockedResponse(txnId, "Payer account is blocked", 1.0);

        Optional<VPARegistry> payeeVpaOpt = vpaRegistryRepository.findByVpa(request.getPayeeVpa());
        if (payeeVpaOpt.isEmpty()) return buildFailedResponse(txnId, "Payee VPA not registered");
        VPARegistry payeeVpa = payeeVpaOpt.get();

        String payerBank = payerVpa.getLinkedBankHandle();
        String payeeBank = payeeVpa.getLinkedBankHandle();
        String payerAccountNumber = payerVpa.getAccountRef();
        String payeeAccountNumber = payeeVpa.getAccountRef();

        // Step 3: Fraud Check
        double riskScore = fraudDetectionService.calculateRiskScore(request);
        String riskFlag = determineRiskFlag(riskScore);

        SwitchTransaction transaction = SwitchTransaction.builder()
                .globalTxnId(txnId)
                .payerVpa(request.getPayerVpa())
                .payeeVpa(request.getPayeeVpa())
                .amount(request.getAmount())
                .payerBank(payerBank)
                .payeeBank(payeeBank)
                .senderIp(request.getFraudCheckData() != null ? request.getFraudCheckData().getIpAddress() : null)
                .senderDeviceId(request.getFraudCheckData() != null ? request.getFraudCheckData().getDeviceId() : null)
                .mlFraudScore(BigDecimal.valueOf(riskScore))
                .riskFlag(riskFlag)
                .status("PENDING")
                .createdAt(LocalDateTime.now())
                .build();
        transactionRepository.save(transaction); // WRITE 1

        // Step 4: Block Check
        if (riskScore > FRAUD_THRESHOLD) {
            transaction.setStatus("BLOCKED_FRAUD");
            transactionRepository.save(transaction); // WRITE 2
            return buildBlockedResponse(txnId, "Transaction blocked: High risk detected", riskScore);
        }

        // Step 5: Debit
        TransactionResponse debitResponse = bankClient.debit(request, payerBank, payerAccountNumber, riskScore);
        if (debitResponse.getStatus() != TransactionStatus.SUCCESS) {
            transaction.setStatus("FAILED");
            transactionRepository.save(transaction); // WRITE 3
            return TransactionResponse.builder().txnId(txnId).status(debitResponse.getStatus()).message("Debit failed: " + debitResponse.getMessage()).riskScore(riskScore).build();
        }

        // Step 6: Credit
        TransactionResponse creditResponse = bankClient.credit(request, payeeBank, payeeAccountNumber, riskScore);
        if (creditResponse.getStatus() != TransactionStatus.SUCCESS) {
            bankClient.reverse(request, payerBank, payerAccountNumber);
            transaction.setStatus("FAILED");
            transactionRepository.save(transaction); // WRITE 4
            return TransactionResponse.builder().txnId(txnId).status(TransactionStatus.FAILED).message("Credit failed: " + creditResponse.getMessage()).riskScore(riskScore).build();
        }

        // Step 7: Success!
        transaction.setStatus("SUCCESS");
        transactionRepository.save(transaction); // WRITE 5

        log.info("Transaction SUCCESS: txnId={}", txnId);

        // 🔥 FIRE AND FORGET GRAPH SYNC
        triggerGraphSync();

        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.SUCCESS)
                .message("Payment Successful")
                .riskScore(riskScore)
                .build();
    }

    // HELPER METHOD FOR SYNC
    private void triggerGraphSync() {
        CompletableFuture.runAsync(() -> {
            try {
                String url = "http://localhost:8000/sync/transactions";
                restTemplate.postForLocation(url, null);
                log.info("🚀 Triggered Graph Sync for new transaction");
            } catch (Exception e) {
                log.warn("⚠️ Failed to trigger Graph Sync: {}", e.getMessage());
            }
        });
    }

    /**
     * Helper to look up Bank Handle.
     * ✅ READ-ONLY: Simple Lookup -> REPLICA
     */
    @Transactional(readOnly = true)
    public String lookupBankForVpa(String vpa) {
        return vpaRegistryRepository.findByVpa(vpa)
                .map(VPARegistry::getLinkedBankHandle)
                .orElse(null);
    }

    private String determineRiskFlag(double riskScore) {
        if (riskScore > 0.75) return "BLOCK";
        if (riskScore > 0.50) return "REVIEW";
        return "SAFE";
    }

    private TransactionResponse buildFailedResponse(String txnId, String message) {
        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.FAILED)
                .message(message)
                .build();
    }

    private TransactionResponse buildBlockedResponse(String txnId, String message, double riskScore) {
        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.BLOCKED_FRAUD)
                .message(message)
                .riskScore(riskScore)
                .build();
    }
}