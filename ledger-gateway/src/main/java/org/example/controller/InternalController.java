package org.example.controller;

import org.example.dto.BlockRequest;
import org.example.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Internal REST Controller.
 * SECURE ENDPOINTS: Should only be accessible by other microservices (Switch),
 * not by public users.
 */
@RestController
@RequestMapping("/api/internal") // ✅ Matches the path you asked for
public class InternalController {

    private static final Logger log = LoggerFactory.getLogger(InternalController.class);

    private final DeviceRepository userDeviceRepository;

    public InternalController(DeviceRepository userDeviceRepository) {
        this.userDeviceRepository = userDeviceRepository;
    }

    /**
     * Block a list of users (Kill Switch).
     * Called by Ledger-Switch when fraud is detected.
     * * POST /api/internal/block-users
     */
    @PostMapping("/block-users")
    public ResponseEntity<?> blockUsers(@RequestBody BlockRequest request) {
        if (request.userIds() == null || request.userIds().isEmpty()) {
            return ResponseEntity.badRequest().body("No user IDs provided");
        }

        log.warn("🚨 INTERNAL COMMAND: Blocking {} users. Reason: {}",
                request.userIds().size(), request.reason());

        try {
            // 🚀 EXECUTE THE DB UPDATE
            // This sets is_trusted = false for all devices owned by these users
            userDeviceRepository.blockDevicesForUsers(request.userIds());

            log.info("✅ Kill Switch Executed Successfully.");
            return ResponseEntity.ok("Users blocked successfully");

        } catch (Exception e) {
            log.error("❌ Failed to execute block command", e);
            return ResponseEntity.internalServerError().body("Database error");
        }
    }
}