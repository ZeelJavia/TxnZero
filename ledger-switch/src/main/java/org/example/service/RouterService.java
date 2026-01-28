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
import org.springframework.web.client.RestTemplate;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

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

    // ✅ Added Redis Pool for Feedback Loop
    private final JedisPool redisPool;

    private final RestTemplate restTemplate = new RestTemplate();

    public RouterService(VPARegistryRepository vpaRegistryRepository,
                         SwitchTransactionRepository transactionRepository,
                         FraudDetectionService fraudDetectionService,
                         BankClient bankClient) {
        this.vpaRegistryRepository = vpaRegistryRepository;
        this.transactionRepository = transactionRepository;
        this.fraudDetectionService = fraudDetectionService;
        this.bankClient = bankClient;
        // Initialize Redis Pool (Connects to localhost:6379)
        this.redisPool = new JedisPool("localhost", 6379);
    }

    /**
     * Main Payment Routing Logic.
     */
    @Transactional
    public TransactionResponse routeTransaction(PaymentRequest request) {

        String txnId = request.getTxnId();
        log.info("Routing transaction: {}", txnId);

        // Step 1: Payer/Payee Lookup
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

        // Step 3: Fraud Check (Rules + GNN + RL)
        // This returns the FINAL decision score (0.0, 0.65, or 1.0)
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
        transactionRepository.save(transaction);

        // Step 4: Block Check
        if (riskScore > FRAUD_THRESHOLD) {
            transaction.setStatus("BLOCKED_FRAUD");
            transactionRepository.save(transaction);

            // 🔄 FEEDBACK LOOP: Update Redis immediately so RL knows this user was Blocked
            triggerPostTransactionActions(request.getPayerVpa(), riskScore, false);


            //set account is fronzen
            bankClient.setAccountFrozen(payerBank, payerAccountNumber, true);

            return buildBlockedResponse(txnId, "Transaction blocked: High risk detected", riskScore);
        }

        // Step 5: Debit
        TransactionResponse debitResponse = bankClient.debit(request, payerBank, payerAccountNumber, riskScore);
        if (debitResponse.getStatus() != TransactionStatus.SUCCESS) {
            transaction.setStatus("FAILED");
            transactionRepository.save(transaction);
            return TransactionResponse.builder().txnId(txnId).status(debitResponse.getStatus()).message("Debit failed: " + debitResponse.getMessage()).riskScore(riskScore).build();
        }

        // Step 6: Credit
        TransactionResponse creditResponse = bankClient.credit(request, payeeBank, payeeAccountNumber, riskScore);
        if (creditResponse.getStatus() != TransactionStatus.SUCCESS) {
            bankClient.reverse(request, payerBank, payerAccountNumber);
            transaction.setStatus("FAILED");
            transactionRepository.save(transaction);
            return TransactionResponse.builder().txnId(txnId).status(TransactionStatus.FAILED).message("Credit failed: " + creditResponse.getMessage()).riskScore(riskScore).build();
        }

        // Step 7: Success!
        transaction.setStatus("SUCCESS");
        transactionRepository.save(transaction);

        log.info("Transaction SUCCESS: txnId={}", txnId);

        // 🔄 FEEDBACK LOOP & GRAPH SYNC (Fire and Forget)
        // We pass the riskScore (likely 0.0 or 0.65 here) to update their history
        triggerPostTransactionActions(request.getPayerVpa(), riskScore, true);

        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.SUCCESS)
                .message("Payment Successful")
                .riskScore(riskScore)
                .debitSmsNotificationTask(debitResponse.getDebitSmsNotificationTask())
                .creditSmsNotificationTask(creditResponse.getCreditSmsNotificationTask())
                .build();
    }

    /**
     * 🚀 Async Helper: Updates Graph + Updates RL Feedback Loop in Redis
     */
    private void triggerPostTransactionActions(String payerVpa, double finalRiskScore, boolean triggerGraphSync) {
        CompletableFuture.runAsync(() -> {
            // 1. Update Redis User Profile (The Feedback Loop)
            updateUserProfile(payerVpa, finalRiskScore);

            // 2. Trigger Python Graph Sync (Only on success/new edges)
            if (triggerGraphSync) {
                try {
                    String url = "http://localhost:8000/sync/transactions";
                    restTemplate.postForLocation(url, null);
                    log.info("🚀 Triggered Graph Sync for successful transaction");
                } catch (Exception e) {
                    log.warn("⚠️ Failed to trigger Graph Sync: {}", e.getMessage());
                }
            }
        });
    }

    /**
     * 🧠 UPDATES REDIS FOR THE RL AGENT
     * This ensures the next time this user transacts, the "Old Risk" input
     * reflects the decision made in this transaction.
     */
    public void updateUserProfile(String vpa, double newRiskScore) {
        try (Jedis redis = redisPool.getResource()) {
            String key = "user:" + vpa + ":profile";

            // Create simple JSON payload
            // We save the Risk Score and the Timestamp
            String payload = String.format("{\"risk\": %.2f, \"lastTxnTime\": %d}",
                    newRiskScore, System.currentTimeMillis());

            // Save with 7-day expiry (TTL)
            redis.setex(key, 604800, payload);

            // log.debug("🔄 RL Feedback Loop Updated for {}: {}", vpa, payload);
        } catch (Exception e) {
            log.warn("❌ Failed to update Redis Profile for RL Agent: {}", e.getMessage());
        }
    }

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