package org.example.repository;

import org.example.model.SwitchTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Repository for Switch Transaction persistence and queries.
 * Supports fraud detection velocity checks and reconciliation.
 */
@Repository
public interface SwitchTransactionRepository extends JpaRepository<SwitchTransaction, String> {

    /**
     * Count transactions from a device in the last N minutes.
     * Used for velocity-based fraud detection.
     *
     * @param deviceId The device ID to check
     * @param since    Timestamp to count from
     * @return Number of transactions from this device
     */
    @Query("SELECT COUNT(t) FROM SwitchTransaction t WHERE t.senderDeviceId = :deviceId AND t.createdAt >= :since")
    long countByDeviceIdSince(@Param("deviceId") String deviceId, @Param("since") LocalDateTime since);

    /**
     * Count transactions from an IP address in the last N minutes.
     * Used for velocity-based fraud detection.
     *
     * @param ip    The IP address to check
     * @param since Timestamp to count from
     * @return Number of transactions from this IP
     */
    @Query("SELECT COUNT(t) FROM SwitchTransaction t WHERE t.senderIp = :ip AND t.createdAt >= :since")
    long countByIpSince(@Param("ip") String ip, @Param("since") LocalDateTime since);

    /**
     * Find transactions that are stuck in PENDING status.
     * Used by ReconciliationService for timeout handling.
     *
     * @param status     The status to filter (e.g., "PENDING")
     * @param cutoffTime Transactions older than this are considered stuck
     * @return List of stuck transactions
     */
    List<SwitchTransaction> findByStatusAndCreatedAtBefore(String status, LocalDateTime cutoffTime);

    /**
     * Find all transactions by payer VPA.
     *
     * @param payerVpa The payer's VPA
     * @return List of transactions
     */
    List<SwitchTransaction> findByPayerVpa(String payerVpa);
}
