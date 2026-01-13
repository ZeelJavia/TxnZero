package org.example.repository;

import org.example.model.VPARegistry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for VPA Registry lookups.
 * Maps VPA (e.g., "alice@l0") to Bank Handle (e.g., "AXIS", "SBI").
 */
@Repository
public interface VPARegistryRepository extends JpaRepository<VPARegistry, String> {

    /**
     * Find VPA registry entry by VPA address.
     *
     * @param vpa The virtual payment address (e.g., "alice@l0")
     * @return Optional containing VPA registry if found
     */
    Optional<VPARegistry> findByVpa(String vpa);

    /**
     * Check if a VPA exists in the registry.
     *
     * @param vpa The virtual payment address
     * @return true if VPA is registered
     */
    boolean existsByVpa(String vpa);
}
