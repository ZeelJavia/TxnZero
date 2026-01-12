package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "vpa_registry")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VPARegistry {

    @Id
    private String vpa; // e.g., "alice@l0"

    @Column(name = "linked_bank_handle")
    private String linkedBankHandle; // "AXIS", "SBI"

    @Column(name = "account_ref")
    private String accountRef; // Encrypted Account Reference

    @Column(name = "is_blacklisted")
    private boolean isBlacklisted = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}