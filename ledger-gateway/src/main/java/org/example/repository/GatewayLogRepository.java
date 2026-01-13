package org.example.repository;

import org.example.model.GatewayLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Repository for GatewayLog entity operations.
 * Stores transaction request logs for ML analysis and audit.
 */
@Repository
public interface GatewayLogRepository extends JpaRepository<GatewayLog, String> {

    /**
     * Find all logs for a specific user.
     * Used for user transaction history.
     *
     * @param userId The user's ID
     * @return List of gateway logs
     */
    List<GatewayLog> findByUserId(Long userId);

    /**
     * Find logs by device ID.
     * Used for device-based fraud analysis.
     *
     * @param deviceId The device identifier
     * @return List of logs from that device
     */
    List<GatewayLog> findByDeviceId(String deviceId);

    /**
     * Find logs by IP address.
     * Used for IP-based fraud detection.
     *
     * @param ipAddress The IP address
     * @return List of logs from that IP
     */
    List<GatewayLog> findByIpAddress(String ipAddress);

    /**
     * Find logs within a time window for a user.
     * Used for velocity checks (transactions per minute).
     *
     * @param userId The user's ID
     * @param start  Start time
     * @param end    End time
     * @return List of logs in the time window
     */
    List<GatewayLog> findByUserIdAndTimestampBetween(Long userId, LocalDateTime start, LocalDateTime end);

    /**
     * Count transactions from a device in last N minutes.
     * Used for rate limiting.
     *
     * @param deviceId The device ID
     * @param since    Start time for counting
     * @return Count of transactions
     */
    long countByDeviceIdAndTimestampAfter(String deviceId, LocalDateTime since);
}
