package org.example.dto;

import java.util.List;

// Using Java Record for simplicity (Java 14+)
public record BlockRequest(List<String> userIds, String reason) {}