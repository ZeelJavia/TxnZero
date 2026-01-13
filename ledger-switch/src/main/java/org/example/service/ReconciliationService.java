package org.example.service;

import org.example.model.SwitchTransaction;
import org.example.repository.SwitchTransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Background Reconciliation Service.
 * 
 * Handles:
 * - Timeout detection for stuck PENDING transactions
 * - Periodic status sync with banks
 * - Cleanup of expired suspicious entity blocks
 * 
 * Runs as scheduled background jobs.
 */
@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    // Transactions older than 5 minutes in PENDING are considered stuck
    private static final int PENDING_TIMEOUT_MINUTES = 5;

    private final SwitchTransactionRepository transactionRepository;

    public ReconciliationService(SwitchTransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    /**
     * Scheduled job to detect and handle stuck PENDING transactions.
     * Runs every 2 minutes.
     */
    @Scheduled(fixedRate = 120000) // Every 2 minutes
    @Transactional
    public void reconcilePendingTransactions() {
        log.info("Starting reconciliation for PENDING transactions...");

        LocalDateTime cutoffTime = LocalDateTime.now().minusMinutes(PENDING_TIMEOUT_MINUTES);

        List<SwitchTransaction> stuckTransactions =
                transactionRepository.findByStatusAndCreatedAtBefore("PENDING", cutoffTime);

        if (stuckTransactions.isEmpty()) {
            log.info("No stuck transactions found.");
            return;
        }

        log.warn("Found {} stuck PENDING transactions", stuckTransactions.size());

        for (SwitchTransaction txn : stuckTransactions) {
            try {
                handleStuckTransaction(txn);
            } catch (Exception e) {
                log.error("Failed to reconcile txnId {}: {}", txn.getGlobalTxnId(), e.getMessage());
            }
        }

        log.info("Reconciliation complete.");
    }

    /**
     * Handles a single stuck transaction.
     * 
     * Options:
     * 1. Query bank for actual status
     * 2. Mark as FAILED if timeout exceeded
     * 3. Retry the operation
     * 
     * @param txn The stuck transaction
     */
    private void handleStuckTransaction(SwitchTransaction txn) {
        log.info("Handling stuck transaction: {}", txn.getGlobalTxnId());

        // For now, mark as TIMEOUT_FAILED
        // TODO: Query banks for actual status before marking failed
        txn.setStatus("TIMEOUT_FAILED");
        transactionRepository.save(txn);

        log.warn("Transaction {} marked as TIMEOUT_FAILED", txn.getGlobalTxnId());

        // TODO: Send notification to admin/user about timeout
        // TODO: If debit was successful, initiate reversal
    }

    /**
     * Scheduled job to sync transaction status with banks.
     * Runs every 10 minutes.
     */
    @Scheduled(fixedRate = 600000) // Every 10 minutes
    public void syncWithBanks() {
        log.debug("Bank sync job - Placeholder");
        // TODO: Implement bank status sync
        // Query banks for transactions in PENDING/REVIEW status
        // Update local status based on bank response
    }

    /**
     * Manual trigger for reconciliation.
     * Can be called via admin API.
     */
    public void triggerManualReconciliation() {
        log.info("Manual reconciliation triggered");
        reconcilePendingTransactions();
    }

    /**
     * Get count of stuck transactions.
     * Used for monitoring/alerting.
     */
    public long getStuckTransactionCount() {
        LocalDateTime cutoffTime = LocalDateTime.now().minusMinutes(PENDING_TIMEOUT_MINUTES);
        return transactionRepository.findByStatusAndCreatedAtBefore("PENDING", cutoffTime).size();
    }
}
