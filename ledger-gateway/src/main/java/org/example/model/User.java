package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "phone_number", unique = true, nullable = false)
    private String phoneNumber;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "vpa", unique = true)
    private String vpa;  // Virtual Payment Address (e.g., "alice@l0")

    @Column(name = "kyc_status")
    @Enumerated(EnumType.STRING)
    private Enums.KycStatus kycStatus; // 'PENDING', 'VERIFIED'

    @Column(name = "salt")
    private String salt;

    @Column(name = "password")
    private String password;

    @Column(name = "risk_score")
    private BigDecimal riskScore; // Calculated by ML

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}