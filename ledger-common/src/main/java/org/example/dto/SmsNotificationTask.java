package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SmsNotificationTask {
    private String phoneNumber;
    private String accountNumber;
    private BigDecimal amount;
    private BigDecimal remainingBalance;
    private String type; // "DEBIT" or "CREDIT"
}