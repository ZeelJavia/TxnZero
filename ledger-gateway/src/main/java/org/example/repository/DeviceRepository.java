package org.example.repository;

import org.example.model.User;
import org.example.model.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for UserDevice entity operations.
 * Manages trusted devices linked to users.
 */
@Repository
public interface DeviceRepository extends JpaRepository<UserDevice, String> {

    /**
     * Find device by its hardware ID.
     *
     * @param deviceId The unique device identifier
     * @return Optional containing device if found
     */
    Optional<UserDevice> findByDeviceId(String deviceId);

    /**
     * Find all devices belonging to a user.
     * Used to list user's registered devices.
     *
     * @param user The user entity
     * @return List of user's devices
     */
    List<UserDevice> findByUser(User user);

    /**
     * Find all trusted devices for a user.
     * Used during payment to verify device trust status.
     *
     * @param user The user entity
     * @param isTrusted Trust status filter
     * @return List of devices matching trust status
     */
    List<UserDevice> findByUserAndIsTrusted(User user, boolean isTrusted);

    /**
     * Check if a device is already registered.
     *
     * @param deviceId The device ID to check
     * @return true if device exists
     */
    boolean existsByDeviceId(String deviceId);
}
