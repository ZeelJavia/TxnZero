package org.example.service.imp;

import org.example.model.Enums;
import org.example.model.User;
import org.example.model.UserDevice;
import org.example.repository.DeviceRepository;
import org.example.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service for user onboarding operations. Handles user registration, KYC, and
 * device management.
 */
@Service
public class UserOnboardingService {

    private static final Logger log = LoggerFactory.getLogger(UserOnboardingService.class);

    private final UserRepository userRepository;
    private final DeviceRepository deviceRepository;

    public UserOnboardingService(UserRepository userRepository, DeviceRepository deviceRepository) {
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
    }

    /**
     * Registers a new user in the Gateway system.
     *
     * @param phoneNumber User's phone number (unique identifier)
     * @param fullName User's full name
     * @param vpa Desired VPA (e.g., "alice@l0")
     * @return Created user entity
     * @throws IllegalArgumentException if phone or VPA already exists
     */
    @Transactional
    public User registerUser(String phoneNumber, String fullName, String vpa) {
        log.info("Registering new user with phone: {}", phoneNumber);

        // Check for existing phone number
        if (userRepository.existsByPhoneNumber(phoneNumber)) {
            throw new IllegalArgumentException("Phone number already registered");
        }

        // Check for existing VPA
        if (userRepository.existsByVpa(vpa)) {
            throw new IllegalArgumentException("VPA already taken");
        }

        User user = new User();
        user.setPhoneNumber(phoneNumber);
        user.setFullName(fullName);
        user.setVpa(vpa);
        user.setKycStatus(Enums.KycStatus.PENDING);
        user.setRiskScore(BigDecimal.ZERO);  // Initial risk score
        user.setCreatedAt(LocalDateTime.now());

        User savedUser = userRepository.save(user);
        log.info("User registered successfully with ID: {}", savedUser.getUserId());

        return savedUser;
    }

    /**
     * Adds a new device to user's trusted devices.
     *
     * @param userId User's ID
     * @param deviceId Device hardware ID
     * @param modelName Device model (e.g., "iPhone 15")
     * @param osVersion OS version (e.g., "iOS 18.0")
     * @param loginIp IP address during device registration
     * @return Created device entity
     */
    @Transactional
    public UserDevice addDevice(Long userId, String deviceId, String modelName,
            String osVersion, String loginIp) {
        log.info("Adding device {} for user {}", deviceId, userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Check if device already exists
        if (deviceRepository.existsByDeviceId(deviceId)) {
            throw new IllegalArgumentException("Device already registered");
        }

        UserDevice device = new UserDevice();
        device.setDeviceId(deviceId);
        device.setUser(user);
        device.setModelName(modelName);
        device.setOsVersion(osVersion);
        device.setTrusted(true);  // New devices start as trusted
        device.setLastLoginIp(loginIp);
        device.setFirstSeenAt(LocalDateTime.now());

        UserDevice savedDevice = deviceRepository.save(device);
        log.info("Device added successfully for user {}", userId);

        return savedDevice;
    }

    /**
     * Finds user by VPA. Used during payment initiation.
     *
     * @param vpa Virtual Payment Address
     * @return Optional containing user if found
     */
    @Transactional(readOnly = true)
    public Optional<User> findByVpa(String vpa) {
        return userRepository.findByVpa(vpa);
    }

    /**
     * Finds user by ID.
     *
     * @param userId User's ID
     * @return Optional containing user if found
     */
    @Transactional(readOnly = true)
    public Optional<User> findById(Long userId) {
        return userRepository.findById(userId);
    }

    /**
     * Finds user by phone number.
     *
     * @param phoneNumber User's phone number
     * @return Optional containing user if found
     */
    @Transactional(readOnly = true)
    public Optional<User> findByPhoneNumber(String phoneNumber) {
        return userRepository.findByPhoneNumber(phoneNumber);
    }

    /**
     * Gets all trusted devices for a user.
     *
     * @param userId User's ID
     * @return List of trusted devices
     */
    @Transactional(readOnly = true)
    public List<UserDevice> getTrustedDevices(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return deviceRepository.findByUserAndIsTrusted(user, true);
    }

    /**
     * Marks a device as untrusted (e.g., after suspicious activity).
     *
     * @param deviceId Device to mark untrusted
     */
    @Transactional
    public void markDeviceUntrusted(String deviceId) {
        UserDevice device = deviceRepository.findByDeviceId(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("Device not found"));
        device.setTrusted(false);
        deviceRepository.save(device);
        log.warn("Device {} marked as untrusted", deviceId);
    }

    /**
     * Updates user's KYC status.
     *
     * @param userId User's ID
     * @param kycStatus New KYC status ("PENDING", "VERIFIED", "REJECTED")
     */
    @Transactional
    public void updateKycStatus(Long userId, String kycStatus) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setKycStatus(Enums.KycStatus.valueOf(kycStatus.toUpperCase()));
        userRepository.save(user);
        log.info("KYC status updated for user {}: {}", userId, kycStatus);
    }
}
