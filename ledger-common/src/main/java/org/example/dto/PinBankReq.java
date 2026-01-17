package org.example.dto;

import lombok.*;

@Data
@Setter
@Getter
@AllArgsConstructor
@NoArgsConstructor
public class PinBankReq {
    private String pin;
    private String bankHandle;
    private String vpa;
    private String phoneNumber;
}
