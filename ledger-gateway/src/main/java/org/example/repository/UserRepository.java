package org.example.repository;

import org.example.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for User entity operations.
 * Provides database access for user management in Gateway.
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Find user by phone number.
     * Used during login and registration.
     *
     * @param phoneNumber The user's phone number
     * @return Optional containing user if found
     */
    Optional<User> findByPhoneNumber(String phoneNumber);

    /**
     * Find user by VPA (Virtual Payment Address).
     * Used during payment initiation to validate sender.
     *
     * @param vpa The user's VPA (e.g., "alice@l0")
     * @return Optional containing user if found
     */
    Optional<User> findByVpa(String vpa);

    /**
     * Check if phone number already exists.
     * Used during registration.
     *
     * @param phoneNumber The phone number to check
     * @return true if exists
     */
    boolean existsByPhoneNumber(String phoneNumber);

    /**
     * Check if VPA already exists.
     * Used during VPA creation.
     *
     * @param vpa The VPA to check
     * @return true if exists
     */
    boolean existsByVpa(String vpa);
}
