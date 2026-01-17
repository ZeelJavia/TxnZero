package org.example.service;

import org.example.dto.PhoneReq;
import org.example.dto.Response;
import org.example.model.BankAccount;
import org.example.repository.AccountRepository;
import org.example.utils.GenerateVPAUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class AccountLinkService {

    private static final Logger log = LoggerFactory.getLogger(AccountLinkService.class);

    @Autowired
    private AccountRepository accountRepository;

    @Value("${bank.name}")
    private String bankName;

    // check account is exists or not
    public Response checkAccountExitsViaPhoneNumber(PhoneReq req) {

        log.info("Checking bank account existence for phoneNumber={}", req.getPhoneNumber());

        // 1. get account
        BankAccount account = accountRepository
                .findByPhonoNumber(req.getPhoneNumber())
                .orElse(null);

        // 2. check exists or not
        if (account == null) {
            log.warn("No bank account found for phoneNumber={}", req.getPhoneNumber());

            return new Response(
                    "No account found",
                    404,
                    null,
                    null
            );
        }

        // 3. return isExists
        log.info("Bank account found for phoneNumber={}, accountNumber={}",
                req.getPhoneNumber(), account.getAccountNumber());

        Map<String, Object> map = new HashMap<>();
        map.put("isExits", true);
        map.put("phoneNumber", req.getPhoneNumber());

        return new Response(
                "Bank account received",
                200,
                null,
                map
        );
    }

    public Response createBankUser(BankAccount bankAccount) {
        log.info("Creating new bank account : {}", bankAccount);

        if (accountRepository.existsById(bankAccount.getAccountNumber())) {
            return new Response("Account already exists", 400, null, null);
        }

        BankAccount savedAccount = accountRepository.save(bankAccount);

        Map<String, Object> map = new HashMap<>();
        map.put("accountNumber", savedAccount.getAccountNumber());
        map.put("userName", savedAccount.getUserName());

        return new Response("Account created successfully", 201, null, map);
    }

    public Response generateVPA(PhoneReq req) {

        log.info("Generating VPA for phoneNumber={}, bank={}", req.getPhoneNumber(), bankName);

        // 1. get account
        BankAccount account = accountRepository
                .findByPhonoNumber(req.getPhoneNumber())
                .orElse(null);

        // 2. check exists or not
        if (account == null) {
            log.warn("VPA generation failed. No account found for phoneNumber={}", req.getPhoneNumber());

            return new Response(
                    "No account found",
                    404,
                    null,
                    null
            );
        }

        // 3. generate vpa
        String vpa = GenerateVPAUtil.generateVpa(account.getPhonoNumber(), bankName);

        log.info("VPA generated successfully for accountNumber={}, vpa={}",
                account.getAccountNumber(), vpa);

        // 4. return mask account number and vpa
        Map<String, Object> map = new HashMap<>();
        map.put("vpa", vpa);
        map.put("isExits", true);
        map.put("accountNumber", account.getAccountNumber());
        map.put("phoneNumber", req.getPhoneNumber());

        return new Response(
                "Account fetched",
                200,
                null,
                map
        );
    }
}
