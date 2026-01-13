package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data Transfer Object containing metadata for ML-based fraud detection.
 * Collected by the Gateway and passed to the Switch for risk analysis.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FraudCheckData {

    /**
     * IP address of the user's device.
     * Used for geo-location and blacklist checks.
     * e.g., "192.168.1.5"
     */
    private String ipAddress;

    /**
     * Unique device identifier (UUID).
     * Used to track device history and detect device spoofing.
     * e.g., "device-uuid-1234"
     */
    private String deviceId;

    /**
     * Geographic latitude of the user.
     * Used for location-based anomaly detection.
     * e.g., 19.0760 (Mumbai)
     */
    private Double geoLat;

    /**
     * Geographic longitude of the user.
     * Used for location-based anomaly detection.
     * e.g., 72.8777 (Mumbai)
     */
    private Double geoLong;

    /**
     * WiFi network SSID (optional).
     * Public/unsecured networks increase risk score.
     * e.g., "Public_WiFi" (High risk)
     */
    private String wifiSsid;

    /**
     * User agent string from browser/app.
     * Helps detect emulators or suspicious clients.
     */
    private String userAgent;

    /**
     * Timestamp of the request in milliseconds.
     * Used for velocity checks (transactions per minute).
     */
    private Long requestTimestamp;
}
