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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Core routing service for Switch.
 * Decides which bank to route transactions to based on VPA mapping.
 * 
 * Flow:
 * 1. Lookup payer VPA → Get payer's bank (e.g., AXIS)
 * 2. Lookup payee VPA → Get payee's bank (e.g., SBI)
 * 3. Run fraud detection
 * 4. If fraud score > threshold → BLOCK
 * 5. Call payer's bank for DEBIT
 * 6. If debit success → Call payee's bank for CREDIT
 * 7. If credit fails → Call payer's bank for REVERSAL
 * 8. Return final status
 */
@Service
public class RouterService {

    private static final Logger log = LoggerFactory.getLogger(RouterService.class);

    // Fraud threshold: Block if risk score > 0.75
    private static final double FRAUD_THRESHOLD = 0.75;

    private final VPARegistryRepository vpaRegistryRepository;
    private final SwitchTransactionRepository transactionRepository;
    private final FraudDetectionService fraudDetectionService;
    private final BankClient bankClient;

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
     * Main routing logic for a payment transaction.
     *
     * @param request Payment request from Gateway
     * @return TransactionResponse with final status
     */
    @Transactional
    public TransactionResponse routeTransaction(PaymentRequest request) {

        String txnId = request.getTxnId();
        log.info("Routing transaction: {}", txnId);

        // Step 1: Lookup payer's bank
        Optional<VPARegistry> payerVpaOpt = vpaRegistryRepository.findByVpa(request.getPayerVpa());
        if (payerVpaOpt.isEmpty()) {
            log.warn("Payer VPA not found: {}", request.getPayerVpa());
            return buildFailedResponse(txnId, "Payer VPA not registered");
        }
        VPARegistry payerVpa = payerVpaOpt.get();

        // Check if payer is blacklisted
        if (payerVpa.isBlacklisted()) {
            log.warn("Payer VPA is blacklisted: {}", request.getPayerVpa());
            return buildBlockedResponse(txnId, "Payer account is blocked", 1.0);
        }

        // Step 2: Lookup payee's bank
        Optional<VPARegistry> payeeVpaOpt = vpaRegistryRepository.findByVpa(request.getPayeeVpa());
        if (payeeVpaOpt.isEmpty()) {
            log.warn("Payee VPA not found: {}", request.getPayeeVpa());
            return buildFailedResponse(txnId, "Payee VPA not registered");
        }
        VPARegistry payeeVpa = payeeVpaOpt.get();

        String payerBank = payerVpa.getLinkedBankHandle();
        String payeeBank = payeeVpa.getLinkedBankHandle();

        log.info("Routing: {} ({}) -> {} ({})",
                request.getPayerVpa(), payerBank,
                request.getPayeeVpa(), payeeBank);

        // Step 3: Run fraud detection
        double riskScore = fraudDetectionService.calculateRiskScore(request);
        String riskFlag = determineRiskFlag(riskScore);

        log.info("Fraud check for txnId {}: score={}, flag={}", txnId, riskScore, riskFlag);

        // Create transaction record
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

        transactionRepository.save(transaction);

        // Step 4: Block if fraud detected
        if (riskScore > FRAUD_THRESHOLD) {
            log.warn("Transaction BLOCKED due to high fraud score: {} > {}", riskScore, FRAUD_THRESHOLD);
            transaction.setStatus("BLOCKED_FRAUD");
            transactionRepository.save(transaction);
            return buildBlockedResponse(txnId, "Transaction blocked: High risk detected", riskScore);
        }

        // Step 5: Debit from payer's bank
        TransactionResponse debitResponse = bankClient.debit(request, payerBank);
        if (debitResponse.getStatus() != TransactionStatus.SUCCESS) {
            log.error("Debit failed for txnId {}: {}", txnId, debitResponse.getMessage());
            transaction.setStatus("FAILED");
            transactionRepository.save(transaction);
            return TransactionResponse.builder()
                    .txnId(txnId)
                    .status(debitResponse.getStatus())
                    .message("Debit failed: " + debitResponse.getMessage())
                    .riskScore(riskScore)
                    .build();
        }

        // Step 6: Credit to payee's bank
        TransactionResponse creditResponse = bankClient.credit(request, payeeBank);
        if (creditResponse.getStatus() != TransactionStatus.SUCCESS) {
            log.error("Credit failed for txnId {}: {}. Initiating reversal.", txnId, creditResponse.getMessage());

            // Reversal: Return money to payer
            bankClient.reverse(request, payerBank);

            transaction.setStatus("FAILED");
            transactionRepository.save(transaction);

            return TransactionResponse.builder()
                    .txnId(txnId)
                    .status(TransactionStatus.FAILED)
                    .message("Credit failed: " + creditResponse.getMessage() + ". Amount reversed.")
                    .riskScore(riskScore)
                    .build();
        }

        // Step 7: Success!
        transaction.setStatus("SUCCESS");
        transactionRepository.save(transaction);

        log.info("Transaction SUCCESS: txnId={}", txnId);

        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.SUCCESS)
                .message("Payment Successful")
                .riskScore(riskScore)
                .build();
    }

    /**
     * Lookup bank handle for a VPA.
     */
    public String lookupBankForVpa(String vpa) {
        return vpaRegistryRepository.findByVpa(vpa)
                .map(VPARegistry::getLinkedBankHandle)
                .orElse(null);
    }

    /**
     * Determines risk flag based on score.
     */
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
