package org.example.repository;

import org.example.model.SuspiciousEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Repository for managing suspicious/blocked entities.
 * Stores blocked IPs and Device IDs for fraud prevention.
 */
@Repository
public interface SuspiciousEntityRepository extends JpaRepository<SuspiciousEntity, Long> {

    /**
     * Find a suspicious entity by its value (IP or Device ID).
     *
     * @param entityValue The IP address or Device ID
     * @return Optional containing the entity if found
     */
    Optional<SuspiciousEntity> findByEntityValue(String entityValue);

    /**
     * Check if an entity is currently blocked.
     *
     * @param entityValue The IP or Device ID
     * @param entityType  Type: "IP" or "DEVICE"
     * @param now         Current timestamp
     * @return true if entity is blocked
     */
    boolean existsByEntityValueAndEntityTypeAndBlockedUntilAfter(
            String entityValue, String entityType, LocalDateTime now);

    /**
     * Delete expired blocks (cleanup job).
     *
     * @param now Current timestamp
     */
    void deleteByBlockedUntilBefore(LocalDateTime now);
}
