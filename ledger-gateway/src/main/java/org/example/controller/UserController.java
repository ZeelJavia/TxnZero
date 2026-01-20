package org.example.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.dto.Response;
import org.example.dto.UserDeviceData;
import org.example.model.User;
import org.example.model.UserDevice;
import org.example.service.imp.UserOnboardingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST Controller for user management operations. Handles registration, device
 * linking, and user queries.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    private final UserOnboardingService userOnboardingService;

    public UserController(UserOnboardingService userOnboardingService) {
        this.userOnboardingService = userOnboardingService;
    }

    /**
     * Get current user profile from JWT token.
     *
     * GET /api/users/profile
     */
    @GetMapping("/profile")
    public Response getProfile(HttpServletRequest request) {
        try {
            Long userId = (Long) request.getAttribute("userId");
            String phoneNumber = (String) request.getAttribute("phoneNumber");
            String fullName = (String) request.getAttribute("fullname");
            String vpa = (String) request.getAttribute("vpa");
            @SuppressWarnings("unchecked")
            List<UserDeviceData> devices = (List<UserDeviceData>) request.getAttribute("userDeviceData");

            log.info("Profile requested for userId={}", userId);

            Map<String, Object> data = new HashMap<>();
            data.put("userId", userId);
            data.put("phoneNumber", phoneNumber);
            data.put("fullName", fullName);
            data.put("vpa", vpa);
            data.put("devices", devices);

            // Get additional user data from DB only if userId is available
            if (userId != null) {
                User user = userOnboardingService.findById(userId).orElse(null);
                if (user != null) {
                    data.put("kycStatus", user.getKycStatus() != null ? user.getKycStatus().name() : "PENDING");
                    data.put("createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : null);
                    // Also get the VPA from DB if not in JWT
                    if (vpa == null && user.getVpa() != null) {
                        data.put("vpa", user.getVpa());
                    }
                }
            } else {
                data.put("kycStatus", "PENDING");
            }

            return new Response("Profile retrieved successfully", 200, null, data);
        } catch (Exception e) {
            log.error("Failed to get profile: {}", e.getMessage());
            return new Response("Failed to get profile", 500, e.getMessage(), null);
        }
    }

    /**
     * Register a new user.
     *
     * POST /api/users/register Body: { "phoneNumber": "9876543210", "fullName":
     * "Alice", "vpa": "alice@l0" }
     */
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@RequestBody RegisterRequest request) {
        log.info("Registration request for phone: {}", request.phoneNumber());

        try {
            User user = userOnboardingService.registerUser(
                    request.phoneNumber(),
                    request.fullName(),
                    request.vpa()
            );

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "success", true,
                    "message", "User registered successfully",
                    "userId", user.getUserId(),
                    "vpa", user.getVpa()
            ));
        } catch (IllegalArgumentException e) {
            log.warn("Registration failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", e.getMessage()
            ));
        }
    }

    /**
     * Add a device to user's trusted devices.
     *
     * POST /api/users/add-device Body: { "userId": 1, "deviceId":
     * "device-uuid", "modelName": "iPhone 15", "osVersion": "iOS 18",
     * "loginIp": "192.168.1.1" }
     */
    @PostMapping("/add-device")
    public ResponseEntity<?> addDevice(@RequestBody AddDeviceRequest request) {
        log.info("Add device request for user: {}", request.userId());

        try {
            UserDevice device = userOnboardingService.addDevice(
                    request.userId(),
                    request.deviceId(),
                    request.modelName(),
                    request.osVersion(),
                    request.loginIp()
            );

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "success", true,
                    "message", "Device added successfully",
                    "deviceId", device.getDeviceId(),
                    "isTrusted", device.isTrusted()
            ));
        } catch (IllegalArgumentException e) {
            log.warn("Add device failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", e.getMessage()
            ));
        }
    }

    /**
     * Get user's trusted devices.
     *
     * GET /api/users/{userId}/devices
     */
    @GetMapping("/{userId}/devices")
    public ResponseEntity<?> getUserDevices(@PathVariable Long userId) {
        try {
            List<UserDevice> devices = userOnboardingService.getTrustedDevices(userId);
            return ResponseEntity.ok(devices);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Look up user by VPA.
     *
     * GET /api/users/lookup?vpa=alice@l0
     */
    @GetMapping("/lookup")
    public ResponseEntity<?> lookupByVpa(@RequestParam String vpa) {
        return userOnboardingService.findByVpa(vpa)
                .map(user -> ResponseEntity.ok(Map.of(
                "found", true,
                "userId", user.getUserId(),
                "fullName", user.getFullName(),
                "kycStatus", user.getKycStatus()
        )))
                .orElse(ResponseEntity.ok(Map.of(
                        "found", false,
                        "message", "VPA not found"
                )));
    }

    /**
     * Update user's KYC status.
     *
     * PUT /api/users/{userId}/kyc Body: { "status": "VERIFIED" }
     */
    @PutMapping("/{userId}/kyc")
    public ResponseEntity<?> updateKycStatus(@PathVariable Long userId,
            @RequestBody Map<String, String> body) {
        try {
            String status = body.get("status");
            userOnboardingService.updateKycStatus(userId, status);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "KYC status updated to " + status
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", e.getMessage()
            ));
        }
    }

    // --- Request DTOs (using Java Records) ---
    record RegisterRequest(String phoneNumber, String fullName, String vpa) {

    }

    record AddDeviceRequest(Long userId, String deviceId, String modelName,
            String osVersion, String loginIp) {

    }
}
