package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SendPaymentRequest {
    private String requestId;
    private Long senderId;
    private Long receiverId;
    private BigDecimal amount;
    private String status; // PENDING, ACCEPTED, EXPIRED
    private Instant expiresAt;

}
