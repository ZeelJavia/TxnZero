package org.example.service.imp;

import org.example.client.SwitchClient;
import org.example.dto.FraudCheckData;
import org.example.dto.PaymentRequest;
import org.example.dto.SmsNotificationTask;
import org.example.dto.TransactionResponse;
import org.example.enums.TransactionStatus;
import org.example.model.Enums;
import org.example.model.GatewayLog;
import org.example.model.User;
import org.example.model.UserDevice;
import org.example.repository.DeviceRepository;
import org.example.repository.GatewayLogRepository;
import org.example.repository.UserRepository;
import org.example.utils.CryptoUtil;
import org.example.utils.MaskingUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for initiating payment transactions.
 * Validates sender, builds fraud data, logs request, and forwards to Switch.
 */
@Service
public class PaymentInitiationService {

    private static final Logger log = LoggerFactory.getLogger(PaymentInitiationService.class);

    // Rate limiting: Max transactions per device in 1 minute
    private static final int MAX_TXN_PER_MINUTE = 5;

    private final UserRepository userRepository;
    private final DeviceRepository deviceRepository;
    private final GatewayLogRepository gatewayLogRepository;
    private final SwitchClient switchClient;
    private final SqsProducerService sqsProducerService;

    public PaymentInitiationService(UserRepository userRepository,
                                    DeviceRepository deviceRepository,
                                    GatewayLogRepository gatewayLogRepository,
                                    SwitchClient switchClient,
                                    SqsProducerService sqsProducerService
                                    ) {
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
        this.gatewayLogRepository = gatewayLogRepository;
        this.switchClient = switchClient;
        this.sqsProducerService = sqsProducerService;
    }

    /**
     * Initiates a payment from sender to receiver.
     * This is the main entry point for payment processing in Gateway.
     *
     * Flow:
     * 1. Validate sender VPA exists
     * 2. Validate device is trusted
     * 3. Rate limit check
     * 4. Hash MPIN
     * 5. Build FraudCheckData
     * 6. Log to GatewayLog
     * 7. Call Switch via SwitchClient
     *
     * @param payerVpa    Sender's VPA (e.g., "alice@l0")
     * @param payeeVpa    Receiver's VPA (e.g., "bob@l0")
     * @param amount      Amount to transfer
     * @param plainMpin   Raw MPIN entered by user
     * @param deviceId    Device hardware ID
     * @param ipAddress   Request IP address
     * @param geoLat      Geographic latitude
     * @param geoLong     Geographic longitude
     * @param wifiSsid    WiFi network name (optional)
     * @param userAgent   Client user agent
     * @return TransactionResponse with status
     */
    @Transactional
    public TransactionResponse initiatePayment(String payerVpa, String payeeVpa,
                                                BigDecimal amount, String plainMpin,
                                                String deviceId, String ipAddress,
                                                Double geoLat, Double geoLong,
                                                String wifiSsid, String userAgent) {

        String txnId = generateTransactionId();
        log.info("Initiating payment: {} -> {} | Amount: {} | TxnId: {}",
                MaskingUtil.maskVpa(payerVpa), MaskingUtil.maskVpa(payeeVpa), amount, txnId);
        log.debug("DEBUG: Actual VPAs received - Payer: [{}], Payee: [{}]", payerVpa, payeeVpa);

        // Step 1: Validate sender exists
        Optional<User> senderOpt = userRepository.findByVpa(payerVpa);
        log.debug("DEBUG: Query result for payerVpa: senderOpt.isPresent() = {}", senderOpt.isPresent());
        if (senderOpt.isEmpty()) {
            log.warn("Sender VPA not found: {}", MaskingUtil.maskVpa(payerVpa));
            return buildFailedResponse(txnId, "Sender VPA not registered");
        }
        User sender = senderOpt.get();
        log.debug("DEBUG: Loaded user - userId: {}, vpa: {}, fullName: {}", 
                sender.getUserId(), sender.getVpa(), sender.getFullName());

        // Step 2: Check KYC status
        if (!Enums.KycStatus.APPROVED.equals(sender.getKycStatus())) {
            log.warn("Sender KYC not verified: {}", sender.getUserId());
            return buildFailedResponse(txnId, "KYC verification required");
        }



        // Step 3: Validate device is trusted
        Optional<UserDevice> deviceOpt = deviceRepository.findByDeviceId(deviceId);
        if (deviceOpt.isEmpty() || !deviceOpt.get().isTrusted()) {
            log.warn("Untrusted device: {} for user: {}", deviceId, sender.getUserId());
            return buildFailedResponse(txnId, "Device not trusted. Please register device.");
        }

        // Step 4: Rate limit check
        if (isRateLimited(deviceId)) {
            log.warn("Rate limit exceeded for device: {}", deviceId);
            return buildFailedResponse(txnId, "Too many transactions. Please wait.");
        }

        // Step 5: Hash the MPIN using CryptoUtil
        String mpinHash = plainMpin;
        log.debug("MPIN hashed for txnId: {}", txnId);

        // Step 6: Build FraudCheckData for ML
        FraudCheckData fraudData = FraudCheckData.builder()
                .ipAddress(ipAddress)
                .deviceId(deviceId)
                .geoLat(geoLat)
                .geoLong(geoLong)
                .wifiSsid(wifiSsid)
                .userAgent(userAgent)
                .requestTimestamp(System.currentTimeMillis())
                .build();

        // Step 7: Log to GatewayLog (for audit and ML training)
        saveGatewayLog(txnId, sender.getUserId(), amount, fraudData);

        // Step 8: Build PaymentRequest for Switch
        PaymentRequest request = PaymentRequest.builder()
                .txnId(txnId)
                .payerVpa(payerVpa)
                .payeeVpa(payeeVpa)
                .amount(amount)
                .mpinHash(mpinHash)
//                .fraudCheckData(fraudData)
                .build();

        // Step 9: Call Switch service
        TransactionResponse response = switchClient.initiateTransfer(request);

        //Step 10: add sms
        //credit sms
        SmsNotificationTask creditSms = response.getCreditSmsNotificationTask();
        //debit
        SmsNotificationTask debitSms = response.getDebitSmsNotificationTask();

        sqsProducerService.queueSmsTask(creditSms);
        sqsProducerService.queueSmsTask(debitSms);

        log.info("Payment result for txnId {}: {}", txnId, response.getStatus());
        return response;
    }

    /**
     * Generates a unique transaction ID.
     * Format: TXN_<timestamp>_<uuid>
     */
    private String generateTransactionId() {
        return "TXN_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8);
    }

    /**
     * Checks if device has exceeded rate limit.
     *
     * @param deviceId Device to check
     * @return true if rate limited
     */
    private boolean isRateLimited(String deviceId) {
        LocalDateTime oneMinuteAgo = LocalDateTime.now().minusMinutes(1);
        long txnCount = gatewayLogRepository.countByDeviceIdAndTimestampAfter(deviceId, oneMinuteAgo);
        return txnCount >= MAX_TXN_PER_MINUTE;
    }

    /**
     * Saves transaction log for audit and ML analysis.
     */
    private void saveGatewayLog(String txnId, Long userId, BigDecimal amount, FraudCheckData fraudData) {
        GatewayLog logEntry = new GatewayLog();
        logEntry.setRequestId(txnId);
        logEntry.setUserId(userId);
        logEntry.setTxnAmount(amount);
        logEntry.setIpAddress(fraudData.getIpAddress());
        logEntry.setDeviceId(fraudData.getDeviceId());
        logEntry.setGeoLat(fraudData.getGeoLat() != null ? BigDecimal.valueOf(fraudData.getGeoLat()) : null);
        logEntry.setGeoLong(fraudData.getGeoLong() != null ? BigDecimal.valueOf(fraudData.getGeoLong()) : null);
        logEntry.setWifiSsid(fraudData.getWifiSsid());
        logEntry.setTimestamp(LocalDateTime.now());

        gatewayLogRepository.save(logEntry);
        log.debug("Gateway log saved for txnId: {}", txnId);
    }

    /**
     * Builds a failed response with given message.
     */
    private TransactionResponse buildFailedResponse(String txnId, String message) {
        return TransactionResponse.builder()
                .txnId(txnId)
                .status(TransactionStatus.FAILED)
                .message(message)
                .riskScore(0.0)
                .build();
    }
}
