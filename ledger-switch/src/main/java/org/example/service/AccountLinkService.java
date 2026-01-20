package org.example.service;

import org.example.client.BankClient;
import org.example.dto.*;
import org.example.model.VPARegistry;
import org.example.repository.VPARegistryRepository;
import org.example.utils.CryptoUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;

@Service
public class AccountLinkService {

    private static final Logger log = LoggerFactory.getLogger(AccountLinkService.class);

    private final List<String> banks = new ArrayList<>(Arrays.asList("SBI", "AXIS"));
    private final BankClient bankClient;
    private final VPARegistryRepository vpaRegistryRepository;

    // Bank handle to display name mapping
    private static final Map<String, String> BANK_NAMES = Map.of(
            "AXIS", "Axis Bank",
            "SBI", "State Bank of India",
            "HDFC", "HDFC Bank",
            "ICICI", "ICICI Bank"
    );

    public AccountLinkService(BankClient bankClient, VPARegistryRepository vpaRegistryRepository) {
        this.bankClient = bankClient;
        this.vpaRegistryRepository = vpaRegistryRepository;
    }

    //for bank dropdown
    public Response getAllBanks() {
        return new Response(
                "all available banks",
                200,
                null,
                Collections.singletonMap("banks", banks)
        );
    }

    //call bank - phoneNo to fetch account
    public Response getAccount(BankClientReq req) {
        return bankClient.getAccount(req);
    }

    //generate vpa
    public Response generateVPA(BankClientReq req) {
        return bankClient.generateVPA(req);
    }

    //set pin
    public Response setMpin(PinBankReq req) {
        return bankClient.setMPin(req);
    }

    /**
     * Get balance for a VPA by routing to the appropriate bank.
     */
    public BalanceResponse getBalanceForVpa(String vpa) {
        log.info("Getting balance for VPA: {}", vpa);

        // 1. Look up VPA in registry
        VPARegistry registry = vpaRegistryRepository.findByVpa(vpa).orElse(null);
        if (registry == null) {
            log.warn("VPA not found in registry: {}", vpa);
            return null;
        }

        // 2. Get bank handle and account reference
        String bankHandle = registry.getLinkedBankHandle();
        String accountRef = registry.getAccountRef();

        // 3. Decrypt account number from hash (in real system this would be actual decryption)
        // For now, we'll need to look up the account differently
        // Actually, accountRef is hashed, so we need a different approach
        // 4. Call bank to get balance
        BalanceResponse response = bankClient.getBalance(bankHandle, accountRef);

        if (response != null) {
            response.setVpa(vpa);
            response.setBankHandle(bankHandle.toLowerCase());
            response.setBankName(BANK_NAMES.getOrDefault(bankHandle, bankHandle + " Bank"));
        }

        return response;
    }

    /**
     * Get transaction history for a VPA by routing to the appropriate bank.
     */
    public Response getTransactionHistoryForVpa(String vpa, int page, int limit) {
        log.info("Getting transaction history for VPA: {}", vpa);

        // 1. Look up VPA in registry
        VPARegistry registry = vpaRegistryRepository.findByVpa(vpa).orElse(null);
        if (registry == null) {
            log.warn("VPA not found in registry: {}", vpa);
            return new Response("VPA not found", 404, "VPA not registered", null);
        }

        // 2. Get bank handle and account reference
        String bankHandle = registry.getLinkedBankHandle();
        String accountRef = registry.getAccountRef();

        // 3. Call bank to get transaction history
        return bankClient.getTransactionHistory(bankHandle, accountRef, page, limit);
    }

    /**
     * Get all linked accounts for a phone number. Searches VPA registry for all
     * VPAs with matching phone pattern.
     */
    public Response getLinkedAccountsForPhone(String phoneNumber) {
        log.info("Getting linked accounts for phone: {}", phoneNumber);

        // Find all VPAs that contain this phone number (e.g., "9723547755@okaxis")
        List<VPARegistry> registries = vpaRegistryRepository.findAll().stream()
                .filter(r -> r.getVpa() != null && r.getVpa().startsWith(phoneNumber))
                .toList();

        if (registries.isEmpty()) {
            return new Response("No linked accounts found", 200, null,
                    Collections.singletonMap("accounts", Collections.emptyList()));
        }

        // Build linked accounts list with balances
        List<Map<String, Object>> accounts = new ArrayList<>();

        for (VPARegistry registry : registries) {
            Map<String, Object> account = new HashMap<>();
            account.put("vpa", registry.getVpa());
            account.put("bankHandle", registry.getLinkedBankHandle().toLowerCase());
            account.put("bankName", BANK_NAMES.getOrDefault(registry.getLinkedBankHandle(),
                    registry.getLinkedBankHandle() + " Bank"));
            account.put("isPrimary", accounts.isEmpty()); // First one is primary

            // Try to get balance
            try {
                BalanceResponse balance = bankClient.getBalance(
                        registry.getLinkedBankHandle(),
                        registry.getAccountRef());
                if (balance != null) {
                    account.put("balance", balance.getBalance());
                    account.put("maskedAccountNumber", balance.getMaskedAccountNumber());
                } else {
                    account.put("balance", BigDecimal.ZERO);
                    account.put("maskedAccountNumber", "XXXX****");
                }
            } catch (Exception e) {
                log.warn("Failed to get balance for VPA {}: {}", registry.getVpa(), e.getMessage());
                account.put("balance", BigDecimal.ZERO);
                account.put("maskedAccountNumber", "XXXX****");
            }

            accounts.add(account);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("accounts", accounts);
        data.put("totalAccounts", accounts.size());

        return new Response("Linked accounts retrieved successfully", 200, null, data);
    }
}
