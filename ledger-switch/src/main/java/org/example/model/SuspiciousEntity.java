package org.example.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "suspicious_entities")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SuspiciousEntity {

    @Id // JPA requires an ID, so we use entityValue as PK or generate one
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entity_value")
    private String entityValue; // The IP or Device ID

    @Column(name = "entity_type")
    private String entityType; // 'IP', 'DEVICE'

    private String reason; // 'High Velocity'

    @Column(name = "blocked_until")
    private LocalDateTime blockedUntil;
}