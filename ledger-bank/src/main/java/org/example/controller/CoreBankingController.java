package org.example.controller;

import org.example.dto.*;
import org.example.enums.TransactionStatus;
import org.example.model.BankAccount;
import org.example.service.AccountLinkService;
import org.example.service.TransactionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

/**
 * Core Banking Controller. Handles debit, credit, and reversal requests from
 * Switch.
 *
 * Endpoints: - POST /api/bank/debit - Debit from payer's account - POST
 * /api/bank/credit - Credit to payee's account - POST /api/bank/reverse -
 * Reverse a failed transaction
 */
@RestController
@RequestMapping("/api/bank")
public class CoreBankingController {

    private static final Logger log = LoggerFactory.getLogger(CoreBankingController.class);

    private final TransactionService transactionService;
    private final AccountLinkService accountLinkService;

    public CoreBankingController(TransactionService transactionService, AccountLinkService accountLinkService) {
        this.transactionService = transactionService;
        this.accountLinkService = accountLinkService;
    }

    /**
     * Debit endpoint - debits amount from payer's account. Called by Switch
     * when processing a payment.
     *
     * @param request Payment request from Switch
     * @param accountNumber Account to debit (from VPA lookup)
     * @param riskScore ML risk score for audit trail
     * @return TransactionResponse with status
     */
    @PostMapping("/debit")
    public ResponseEntity<TransactionResponse> debit(
            @RequestBody PaymentRequest request,
            @RequestHeader("X-Account-Number") String accountNumber,
            @RequestHeader(value = "X-Risk-Score", required = false, defaultValue = "0.0") BigDecimal riskScore) {

        log.info("Received DEBIT request: txnId={}, amount={}",
                request.getTxnId(), request.getAmount());

        // Validate request
        if (request.getTxnId() == null || request.getAmount() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Missing required fields: txnId or amount")
                            .build());
        }

        if (request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Amount must be positive")
                            .build());
        }

        TransactionResponse response = transactionService.debit(request, accountNumber, riskScore);

        if (response.getStatus() == TransactionStatus.SUCCESS) {
            return ResponseEntity.ok(response);
        } else {
            log.info("Transaction failed with status response {} response {}", response.getStatus(), response);
            return ResponseEntity.unprocessableEntity().body(response);
        }
    }

    /**
     * Credit endpoint - credits amount to payee's account. Called by Switch
     * after successful debit.
     *
     * @param request Payment request from Switch
     * @param accountNumber Account to credit (from VPA lookup)
     * @param riskScore ML risk score for audit trail
     * @return TransactionResponse with status
     */
    @PostMapping("/credit")
    public ResponseEntity<TransactionResponse> credit(
            @RequestBody PaymentRequest request,
            @RequestHeader("X-Account-Number") String accountNumber,
            @RequestHeader(value = "X-Risk-Score", required = false, defaultValue = "0.0") BigDecimal riskScore) {

        log.info("Received CREDIT request: txnId={}, amount={}",
                request.getTxnId(), request.getAmount());

        // Validate request
        if (request.getTxnId() == null || request.getAmount() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Missing required fields: txnId or amount")
                            .build());
        }

        if (request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Amount must be positive")
                            .build());
        }

        TransactionResponse response = transactionService.credit(request, accountNumber, riskScore);

        if (response.getStatus() == TransactionStatus.SUCCESS) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.unprocessableEntity().body(response);
        }
    }

    /**
     * Reverse endpoint - reverses a debit operation. Called by Switch when
     * credit fails after debit succeeded.
     *
     * @param request Original payment request
     * @param accountNumber Account to credit back (payer's account)
     * @return TransactionResponse with status
     */
    @PostMapping("/reverse")
    public ResponseEntity<TransactionResponse> reverse(
            @RequestBody PaymentRequest request,
            @RequestHeader("X-Account-Number") String accountNumber) {

        log.info("Received REVERSE request: txnId={}, amount={}",
                request.getTxnId(), request.getAmount());

        if (request.getTxnId() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(TransactionStatus.FAILED)
                            .message("Missing txnId for reversal")
                            .build());
        }

        TransactionResponse response = transactionService.reverseDebit(request, accountNumber);

        if (response.getStatus() == TransactionStatus.SUCCESS) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.unprocessableEntity().body(response);
        }
    }

    /**
     * get account*
     */
    @PostMapping("/account-exits")
    public Response getAccountViaPhone(@RequestBody PhoneReq req) {
        return accountLinkService.checkAccountExitsViaPhoneNumber(req);
    }

    /**
     * generate VPA return mask account and generated vpa
     */
    @PostMapping("/generate-vpa")
    public Response generateVPA(@RequestBody PhoneReq req) {
        return accountLinkService.generateVPA(req);
    }

    /**
     * Create Account
     */
    @PostMapping("/create-account")
    public Response createAccount(@RequestBody BankAccount bankAccount) {
        return accountLinkService.createBankUser(bankAccount);
    }

    /**
     * pin set
     */
    @PostMapping("/set-mpin")
    public Response setMPin(@RequestBody PinBankReq req) {
        return accountLinkService.setPinToAccount(req);
    }

    /**
     * Get account balance. Called by Switch when user requests balance check.
     */
    @GetMapping("/balance/{accountNumber}")
    public ResponseEntity<BalanceResponse> getBalance(@PathVariable String accountNumber) {
        log.info("Balance inquiry for account: {}", maskAccountNumber(accountNumber));

        BankAccount account = transactionService.getAccountByNumber(accountNumber);
        if (account == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(BalanceResponse.builder()
                .maskedAccountNumber(maskAccountNumber(accountNumber))
                .balance(account.getCurrentBalance())
                .build());
    }

    /**
     * Get transaction history for an account (paginated). Called by Switch to
     * fetch user's transaction history.
     */
    @GetMapping("/transactions/{accountNumber}")
    public ResponseEntity<Response> getTransactionHistory(
            @PathVariable String accountNumber,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int limit) {
        log.info("Transaction history request: account={}, page={}, limit={}",
                maskAccountNumber(accountNumber), page, limit);

        Response response = transactionService.getTransactionHistory(accountNumber, page, limit);
        return ResponseEntity.ok(response);
    }

    private String maskAccountNumber(String accountNumber) {
        if (accountNumber == null || accountNumber.length() < 4) {
            return "****";
        }
        return "XXXX" + accountNumber.substring(accountNumber.length() - 4);
    }

    /**
     * Health check endpoint for load balancer.
     */
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
