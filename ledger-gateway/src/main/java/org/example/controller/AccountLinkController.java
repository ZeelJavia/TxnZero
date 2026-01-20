package org.example.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.dto.*;
import org.example.service.imp.AccountLinkService;
import org.example.utils.JwtUtil;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
public class AccountLinkController {

    private final AccountLinkService accountLinkService;

    public AccountLinkController(AccountLinkService accountLinkService) {
        this.accountLinkService = accountLinkService;
    }

    /**
     * get banks
     *
     */
    @GetMapping("/banks")
    public Response getAllBanks() {
        return accountLinkService.getAllBanks();
    }

    /**
     * send otp to phone number which is linked with phone number
     *
     */
    @PostMapping("/bank/otp")
    public Response sendOtp(HttpServletRequest request, @RequestBody BankHandlerReq req) {
        return accountLinkService.sendOtpToPhoneNumber(request, req);
    }

    /**
     * otp check and vpa generating
     *
     * @param req
     * @return Response
     */
    @PostMapping("/bank/vpa-generate")
    public Response generateVPA(HttpServletRequest request, HttpServletResponse response, @RequestBody BankHandlerVerificationReq req) {
        return accountLinkService.checkOtpAndGenerateVPA(request, response, req);
    }

    /**
     * set mpin
     */
    @PostMapping("/bank/set-mpin")
    public Response setMPin(HttpServletRequest request, @RequestBody PinBankReq bankReq) {
        return accountLinkService.setMpinToAccount(request, bankReq);
    }

    /**
     * Get all linked bank accounts for the authenticated user. Returns VPAs,
     * bank info, and balances. Flow: Frontend → Gateway → Switch → Bank
     */
    @GetMapping("/linked")
    public Response getLinkedAccounts(HttpServletRequest request) {
        return accountLinkService.getLinkedAccounts(request);
    }

    /**
     * Get balance for a specific VPA. Flow: Frontend → Gateway → Switch → Bank
     */
    @GetMapping("/balance")
    public Response getBalance(HttpServletRequest request) {
        return accountLinkService.getBalance(request);
    }

    /**
     * Get transaction history for the user's VPA. Flow: Frontend → Gateway →
     * Switch → Bank
     */
    @GetMapping("/transactions")
    public Response getTransactionHistory(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int limit) {
        return accountLinkService.getTransactionHistory(request, page, limit);
    }
}
