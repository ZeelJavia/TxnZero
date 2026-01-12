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

    @Column(name = "kyc_status")
    private String kycStatus; // 'PENDING', 'VERIFIED'

    @Column(name = "risk_score")
    private BigDecimal riskScore; // Calculated by ML daily

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}