package org.example.service;

import org.example.dto.PhoneReq;
import org.example.dto.PinBankReq;
import org.example.dto.Response;
import org.example.model.BankAccount;
import org.example.repository.AccountRepository;
import org.example.utils.CryptoUtil;
import org.example.utils.GenerateVPAUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional; // ✅ Import Spring Transactional

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccountLinkService {

    private static final Logger log = LoggerFactory.getLogger(AccountLinkService.class);

    @Autowired
    private AccountRepository accountRepository;

    @Value("${bank.name}")
    private String bankName;


    // check account is exists or not
    // ✅ READ-ONLY: Lookup by phone -> REPLICA
    @Transactional(readOnly = true)
    public Response checkAccountExitsViaPhoneNumber(PhoneReq req) {

        log.info("Checking bank account existence for phoneNumber={}", req.getPhoneNumber());
        String phoneNumber = req.getPhoneNumber();
        log.info("2. Bank account existence for phoneNumber={} and len={}", phoneNumber, phoneNumber.length());

        // 1. get account
        BankAccount account = accountRepository
                .findByPhoneNumber(phoneNumber)
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
        log.info("Bank account found for phoneNumber={}", phoneNumber);

        // 3. return isExists
        log.info("Bank account found for phoneNumber={}, accountNumber={}",
                req.getPhoneNumber(), account.getAccountNumber());

        Map<String, Object> map = new HashMap<>();
        map.put("isExits", true);
        map.put("phoneNumber", req.getPhoneNumber());

        log.info("** Data is {}", map.toString());

        return new Response(
                "Bank account received",
                200,
                null,
                map
        );
    }

    // ❌ WRITER: Creates Account -> PRIMARY
    @Transactional
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

    // ✅ READ-ONLY: Computes VPA string (No DB Write) -> REPLICA
    @Transactional(readOnly = true)
    public Response generateVPA(PhoneReq req) {

        log.info("Generating VPA for phoneNumber={}, bank={}", req.getPhoneNumber(), bankName);
        String phoneNumber = req.getPhoneNumber();

        log.info("VPA generation for phoneNumber={}", phoneNumber);

        // 1. get account
        BankAccount account = accountRepository
                .findByPhoneNumber(phoneNumber)
                .orElse(null);

        // 2. check exists or not
        if (account == null) {
            log.warn("VPA generation failed. No account found for phoneNumber={}", phoneNumber);

            return new Response(
                    "No account found",
                    404,
                    null,
                    null
            );
        }

        // 3. generate vpa
        String vpa = GenerateVPAUtil.generateVpa(phoneNumber, bankName);
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

    //set pin
    // ❌ WRITER: Updates MPIN -> PRIMARY
    @Transactional
    public Response setPinToAccount(PinBankReq req) {
        log.info("req for phoneNumber={}", req.getPhoneNumber());
        log.info("req data = {}", req);

        //1. get data
        String pin = req.getPin();


        //2. gen salt
        String salt = CryptoUtil.generateSalt();

        //3. hashed pin
        String hashedPin = CryptoUtil.hashMpinWithSalt(pin, salt);

        //4. saved in db
        BankAccount account = accountRepository.findByPhoneNumber(req.getPhoneNumber()).orElse(null);
        log.info("Account found for account={} and phoneNumber={}", account, req.getPhoneNumber());

        if(account == null) {
            return new Response(
                    "account not found",
                    404,
                    null,
                    null
            );
        }
        account.setMpinHash(hashedPin);
        account.setSalt(salt);
        accountRepository.save(account);

        return new Response("Pin set successfully", 200, null, null);

    }
}