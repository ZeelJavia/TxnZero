package org.example.dto;

import lombok.*;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Setter
@Getter
public class UserDeviceData {
    private String deviceId; // Hardware ID

    private String modelName;

    private String osVersion;

    private boolean isTrusted;

    private String lastLoginIp;

    private LocalDateTime firstSeenAt;
}
