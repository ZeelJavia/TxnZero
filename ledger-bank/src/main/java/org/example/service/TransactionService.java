package org.example.service;

import org.example.dto.PaymentRequest;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus;
import org.example.model.AccountLedger;
import org.example.model.BankAccount;
import org.example.repository.AccountRepository;
import org.example.repository.LedgerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * Core banking transaction service.
 * Handles debit, credit, and reversal operations with proper locking.
 * 
 * Locking Strategy:
 * 1. PESSIMISTIC_WRITE lock on account row (via repository)
 * 2. @Version for optimistic locking as fallback
 * 3. SERIALIZABLE isolation for critical operations
 */
@Service
public class TransactionService {

    private static final Logger log = LoggerFactory.getLogger(TransactionService.class);

    private final AccountRepository accountRepository;
    private final LedgerRepository ledgerRepository;

    public TransactionService(AccountRepository accountRepository,
                              LedgerRepository ledgerRepository) {
        this.accountRepository = accountRepository;
        this.ledgerRepository = ledgerRepository;
    }

    /**
     * Debits amount from payer's account.
     * Called by Switch during payment processing.
     *
     * @param request   Payment request containing payer info
     * @param accountNumber Account to debit from
     * @param riskScore ML risk score for audit
     * @return TransactionResponse with status
     */
    @Transactional(isolation = Isolation.SERIALIZABLE)
    public TransactionResponse debit(PaymentRequest request, String accountNumber, BigDecimal riskScore) {
        String txnId = request.getTxnId();
        log.info("Processing DEBIT: txnId={}, account={}, amount={}", 
                txnId, maskAccountNumber(accountNumber), request.getAmount());

        try {
            // Idempotency check - prevent duplicate debits
            if (ledgerRepository.existsByGlobalTxnIdAndAccountNumberAndDirection(
                    txnId, accountNumber, AccountLedger.LedgerDirection.DEBIT)) {
                log.warn("Duplicate debit attempt: txnId={}", txnId);
                return buildResponse(txnId, TransactionStatus.SUCCESS, "Already processed");
            }

            // Acquire pessimistic lock on account
            BankAccount account = accountRepository.findByAccountNumberWithLock(accountNumber)
                    .orElse(null);

            if (account == null) {
                log.error("Account not found: {}", maskAccountNumber(accountNumber));
                return buildResponse(txnId, TransactionStatus.FAILED, "Account not found");
            }

            if (Boolean.TRUE.equals(account.getFrozenStatus())) {
                log.warn("❌ Transaction blocked: Account {} is frozen", account.getAccountNumber());
                return TransactionResponse.builder()
                        .status(TransactionStatus.FAILED)
                        .message("Account is frozen")
                        .build();
            }

            // Verify MPIN
            if (!verifyMpin(account, request.getMpinHash())) {
                log.warn("Invalid MPIN for account: {}", maskAccountNumber(accountNumber));
                return buildResponse(txnId, TransactionStatus.FAILED, "Invalid PIN");
            }

            // Check sufficient balance
            if (account.getCurrentBalance().compareTo(request.getAmount()) < 0) {
                log.warn("Insufficient balance: account={}, balance={}, required={}", 
                        maskAccountNumber(accountNumber), account.getCurrentBalance(), request.getAmount());
                return buildResponse(txnId, TransactionStatus.FAILED, "Insufficient balance");
            }

            // Perform debit
            account.debit(request.getAmount());
            accountRepository.save(account);

            // Create ledger entry
            createLedgerEntry(txnId, accountNumber, request.getAmount(),
                    AccountLedger.LedgerDirection.DEBIT,
                    request.getPayeeVpa(),
                    account.getCurrentBalance(),
                    riskScore);

            log.info("DEBIT successful: txnId={}, newBalance={}", 
                    txnId, account.getCurrentBalance());

            return buildResponse(txnId, TransactionStatus.SUCCESS, "Debit successful");

        } catch (ObjectOptimisticLockingFailureException e) {
            log.error("Concurrent modification detected for debit: txnId={}", txnId, e);
            return buildResponse(txnId, TransactionStatus.FAILED, "Concurrent transaction - retry");
        } catch (IllegalStateException e) {
            log.error("Debit failed: txnId={}, reason={}", txnId, e.getMessage());
            return buildResponse(txnId, TransactionStatus.FAILED, e.getMessage());
        }
    }

    /**
     * Credits amount to payee's account.
     * Called by Switch after successful debit from payer.
     *
     * @param request   Payment request containing payee info
     * @param accountNumber Account to credit to
     * @param riskScore ML risk score for audit
     * @return TransactionResponse with status
     */
    @Transactional(isolation = Isolation.SERIALIZABLE)
    public TransactionResponse credit(PaymentRequest request, String accountNumber, BigDecimal riskScore) {
        String txnId = request.getTxnId();
        log.info("Processing CREDIT: txnId={}, account={}, amount={}", 
                txnId, maskAccountNumber(accountNumber), request.getAmount());

        try {
            // Idempotency check - prevent duplicate credits
            if (ledgerRepository.existsByGlobalTxnIdAndAccountNumberAndDirection(
                    txnId, accountNumber, AccountLedger.LedgerDirection.CREDIT)) {
                log.warn("Duplicate credit attempt: txnId={}", txnId);
                return buildResponse(txnId, TransactionStatus.SUCCESS, "Already processed");
            }

            // Acquire pessimistic lock on account
            BankAccount account = accountRepository.findByAccountNumberWithLock(accountNumber)
                    .orElse(null);

            if (account == null) {
                log.error("Account not found for credit: {}", maskAccountNumber(accountNumber));
                return buildResponse(txnId, TransactionStatus.FAILED, "Account not found");
            }

            // Check frozen status (even for credits)
            if (account.getFrozenStatus()) {
                log.warn("Cannot credit frozen account: {}", maskAccountNumber(accountNumber));
                return buildResponse(txnId, TransactionStatus.FAILED, "Beneficiary account is frozen");
            }

            // Perform credit
            account.credit(request.getAmount());
            accountRepository.save(account);

            // Create ledger entry
            createLedgerEntry(txnId, accountNumber, request.getAmount(),
                    AccountLedger.LedgerDirection.CREDIT,
                    request.getPayerVpa(),
                    account.getCurrentBalance(),
                    riskScore);

            log.info("CREDIT successful: txnId={}, newBalance={}", 
                    txnId, account.getCurrentBalance());

            return buildResponse(txnId, TransactionStatus.SUCCESS, "Credit successful");

        } catch (ObjectOptimisticLockingFailureException e) {
            log.error("Concurrent modification detected for credit: txnId={}", txnId, e);
            return buildResponse(txnId, TransactionStatus.FAILED, "Concurrent transaction - retry");
        }
    }

    /**
     * Reverses a debit operation (refunds money to payer).
     * Called when credit to payee fails after debit succeeded.
     *
     * @param request   Original payment request
     * @param accountNumber Account to reverse debit on
     * @return TransactionResponse with status
     */
    @Transactional(isolation = Isolation.SERIALIZABLE)
    public TransactionResponse reverseDebit(PaymentRequest request, String accountNumber) {
        String txnId = request.getTxnId();
        log.info("Processing REVERSAL: txnId={}, account={}, amount={}", 
                txnId, maskAccountNumber(accountNumber), request.getAmount());

        try {
            // Verify original debit exists
            if (!ledgerRepository.existsByGlobalTxnIdAndAccountNumberAndDirection(
                    txnId, accountNumber, AccountLedger.LedgerDirection.DEBIT)) {
                log.warn("No debit found to reverse: txnId={}", txnId);
                return buildResponse(txnId, TransactionStatus.FAILED, "Original debit not found");
            }

            // Check if already reversed (CREDIT entry with same txn would indicate reversal)
            String reversalTxnId = txnId + "_REVERSAL";
            if (ledgerRepository.existsByGlobalTxnIdAndAccountNumberAndDirection(
                    reversalTxnId, accountNumber, AccountLedger.LedgerDirection.CREDIT)) {
                log.warn("Already reversed: txnId={}", txnId);
                return buildResponse(txnId, TransactionStatus.SUCCESS, "Already reversed");
            }

            // Acquire lock and credit back
            BankAccount account = accountRepository.findByAccountNumberWithLock(accountNumber)
                    .orElseThrow(() -> new IllegalStateException("Account not found"));

            account.credit(request.getAmount());
            accountRepository.save(account);

            // Create reversal ledger entry
            createLedgerEntry(reversalTxnId, accountNumber, request.getAmount(),
                    AccountLedger.LedgerDirection.CREDIT,
                    "REVERSAL:" + request.getPayeeVpa(),
                    account.getCurrentBalance(),
                    null);

            log.info("REVERSAL successful: txnId={}, newBalance={}", 
                    txnId, account.getCurrentBalance());

            return buildResponse(txnId, TransactionStatus.SUCCESS, "Reversal successful");

        } catch (Exception e) {
            log.error("Reversal failed: txnId={}, error={}", txnId, e.getMessage(), e);
            return buildResponse(txnId, TransactionStatus.FAILED, "Reversal failed: " + e.getMessage());
        }
    }

    /**
     * Creates immutable ledger entry for audit trail.
     */
    private void createLedgerEntry(String txnId, String accountNumber, BigDecimal amount,
                                   AccountLedger.LedgerDirection direction,
                                   String counterpartyVpa, BigDecimal balanceAfter,
                                   BigDecimal riskScore) {
        // Generate ID manually using database sequence
        Long nextId = ledgerRepository.getNextLedgerId();
        
        AccountLedger entry = AccountLedger.builder()
                .ledgerId(nextId)
                .globalTxnId(txnId)
                .accountNumber(accountNumber)
                .amount(amount)
                .direction(direction)
                .counterpartyVpa(counterpartyVpa)
                .balanceAfter(balanceAfter)
                .riskScore(riskScore)
                .build();

        ledgerRepository.save(entry);
        log.debug("Ledger entry created: {}", entry.getLedgerId());
    }

    /**
     * Verifies MPIN hash matches stored hash.
     */
    private boolean verifyMpin(BankAccount account, String providedMpinHash) {
        if (account.getMpinHash() == null || providedMpinHash == null) {
            return false;
        }
        return account.getMpinHash().equals(providedMpinHash);
    }

    /**
     * Masks account number for logging (shows only last 4 digits).
     */
    private String maskAccountNumber(String accountNumber) {
        if (accountNumber == null || accountNumber.length() < 4) {
            return "****";
        }
        return "****" + accountNumber.substring(accountNumber.length() - 4);
    }

    private TransactionResponse buildResponse(String txnId, TransactionStatus status, String message) {
        return TransactionResponse.builder()
                .txnId(txnId)
                .status(status)
                .message(message)
                .build();
    }
}
