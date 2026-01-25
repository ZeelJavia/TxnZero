package org.example.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.dto.TransactionResponse;
import org.example.model.User;
import org.example.repository.UserRepository;
import org.example.service.imp.PaymentInitiationService;
import org.example.utils.MaskingUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

import java.math.BigDecimal;

/**
 * REST Controller for payment operations. Entry point for initiating UPI-like
 * payments.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final PaymentInitiationService paymentService;
    private final UserRepository userRepository;
    private final JedisPool pool;

    public PaymentController(PaymentInitiationService paymentService, UserRepository userRepository, JedisPool pool) {
        this.paymentService = paymentService;
        this.userRepository = userRepository;
        this.pool = pool;
    }

    /**
     * Initiate a payment transfer.
     *
     * POST /api/payments/initiate
     *
     * This is the main endpoint called by the frontend when user sends money.
     * Flow: Frontend -> Gateway -> Switch -> Banks
     *
     * Request Body: { "payerVpa": "alice@l0", "payeeVpa": "bob@l0", "amount":
     * 500.00, "mpin": "1234", "deviceId": "device-uuid-1234", "ipAddress":
     * "192.168.1.5", "geoLat": 19.0760, "geoLong": 72.8777, "wifiSsid":
     * "Home_WiFi", "userAgent": "LedgerZero-App/1.0" }
     *
     * Response: { "txnId": "TXN_1234567890_abc12345", "status": "SUCCESS",
     * "message": "Payment Successful", "riskScore": 0.15 }
     */
    @PostMapping("/initiate")
    public ResponseEntity<TransactionResponse> initiatePayment(HttpServletRequest req, @RequestBody PaymentInitiateRequest request) {

        // Get VPA from JWT attribute, or look up from database if not present
        String payerVpa = (String) req.getAttribute("vpa");

        Jedis redis = pool.getResource();
        if(redis == null){
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Redis error")
                            .build()
            );
        }

        if(redis.get("Ledger:vpa:" + payerVpa ) != null){
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Already your one payment is running")
                            .build()
            );
        }

        redis.set("Ledger:vpa:" + payerVpa, "true");

        if (payerVpa == null || payerVpa.isEmpty()) {
            // VPA not in JWT, look it up from database using userId
            Long userId = (Long) req.getAttribute("userId");
            if (userId != null) {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && user.getVpa() != null) {
                    payerVpa = user.getVpa();
                }
            }
        }

        // If still no VPA, return error
        if (payerVpa == null || payerVpa.isEmpty()) {
            log.warn("Payment initiation failed: No VPA linked to account");
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("No VPA linked to your account. Please link a bank first.")
                            .build()
            );
        }

        log.info("Payment initiation request: {} -> {} | Amount: {}",
                MaskingUtil.maskVpa(payerVpa),
                MaskingUtil.maskVpa(request.payeeVpa()),
                request.amount());

        // Validate required fields
        if (request.payerVpa() == null || request.payeeVpa() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Payer and Payee VPA are required")
                            .build()
            );
        }

        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Invalid amount")
                            .build()
            );
        }

        if (request.mpin() == null || request.mpin().length() < 4) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Invalid MPIN")
                            .build()
            );
        }

        if (request.deviceId() == null) {
            return ResponseEntity.badRequest().body(
                    TransactionResponse.builder()
                            .status(org.example.enums.TransactionStatus.FAILED)
                            .message("Device ID is required")
                            .build()
            );
        }

        // Initiate payment via service
        TransactionResponse response = paymentService.initiatePayment(
                payerVpa,
                request.payeeVpa(),
                request.amount(),
                request.mpin(),
                request.deviceId(),
                request.ipAddress(),
                request.geoLat(),
                request.geoLong(),
                request.wifiSsid(),
                request.userAgent()
        );
        redis.del("Ledger:vpa:" + payerVpa);
        // Return appropriate HTTP status based on transaction status
        return switch (response.getStatus()) {
            case SUCCESS ->
                ResponseEntity.ok(response);
            case PENDING, DEEMED_APPROVED ->
                ResponseEntity.accepted().body(response);
            case FAILED, BLOCKED_FRAUD ->
                ResponseEntity.ok(response); // Still 200, but status in body
            default ->
                ResponseEntity.ok(response);
        };
    }

    /**
     * Check transaction status.
     *
     * GET /api/payments/status/{txnId}
     *
     * Used by frontend to poll for transaction status.
     */
    @GetMapping("/status/{txnId}")
    public ResponseEntity<?> getTransactionStatus(@PathVariable String txnId) {
        // TODO: Implement status lookup from database/cache
        log.info("Status check for txnId: {}", txnId);

        return ResponseEntity.ok()
                .body(java.util.Map.of(
                        "txnId", txnId,
                        "message", "Status lookup not implemented yet"
                ));
    }

    // --- Request DTO ---
    /**
     * Request body for payment initiation. Uses Java Record for immutability.
     */
    record PaymentInitiateRequest(
            String payerVpa, // Sender's VPA (e.g., "alice@l0")
            String payeeVpa, // Receiver's VPA (e.g., "bob@l0")
            BigDecimal amount, // Amount to transfer
            String mpin, // Raw MPIN (will be hashed in service)
            String deviceId, // Device hardware ID
            String ipAddress, // Request IP
            Double geoLat, // Geographic latitude
            Double geoLong, // Geographic longitude
            String wifiSsid, // WiFi network (optional)
            String userAgent // Client user agent
            ) {
    }
}
