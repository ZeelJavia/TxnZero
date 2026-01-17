package org.example.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.example.dto.UserDeviceData;
import com.fasterxml.jackson.core.type.TypeReference;

import javax.crypto.SecretKey;
import java.util.*;
import java.util.function.Function;

public class JwtUtil {


    //1. generate jwt token
    public static String generateJWTToken(String SECRET_KEY,int exTime, Long userId, String phoneNumber,String fullName, List<UserDeviceData> devices, String vpa) {
        if(vpa.isEmpty()){
            return Jwts.builder()
                    .setSubject(String.valueOf(userId))
                    .claim("phone", phoneNumber)
                    .claim("devices", devices)
                    .claim("fullName", fullName)
                    .setIssuedAt(new Date())
                    .setExpiration(new Date(System.currentTimeMillis() + (exTime * 1000L)))
                    .signWith(Keys.hmacShaKeyFor(SECRET_KEY.getBytes()), SignatureAlgorithm.HS256)
                    .compact();

        }
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .claim("phone", phoneNumber)
                .claim("devices", devices)
                .claim("fullName", fullName)
                .claim("vpa", vpa)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + (exTime * 1000L)))
                .signWith(Keys.hmacShaKeyFor(SECRET_KEY.getBytes()), SignatureAlgorithm.HS256)
                .compact();
    }

    //2. get all data
    private static Claims extractAllClaims(String token, String secretKey) {
        SecretKey key = Keys.hmacShaKeyFor(secretKey.getBytes());
        return Jwts.parserBuilder()
                .setSigningKey(key)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    // 3. Generic Claim Extractor
    public static <T> T extractClaim(String token, String secretKey, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token, secretKey);
        return claimsResolver.apply(claims);
    }

    //4. Validate Token
    public static boolean validateToken(String token, String secretKey) {
        try {
            return !isTokenExpired(token, secretKey);
        } catch (Exception e) {
            return false; // Signature failed or token malformed
        }
    }

    // 5. Extract Specific Fields
    public static Long extractUserId(String token, String secretKey) {
        return Long.parseLong(extractClaim(token, secretKey, Claims::getSubject));
    }

    public static String extractPhoneNumber(String token, String secretKey) {
        return extractClaim(token, secretKey, claims -> claims.get("phone", String.class));
    }

    public static String extractFullName(String token, String secretKey) {
        return extractClaim(token, secretKey, claims -> claims.get("fullName", String.class));
    }

    public static List<UserDeviceData> extractDevice(String token, String secretKey) {
        return extractClaim(token, secretKey, claims -> {
            Object devices = claims.get("devices"); // use correct claim key

            if (devices == null) {
                return Collections.emptyList();
            }

            ObjectMapper mapper = new ObjectMapper();
            return mapper.convertValue(
                    devices,
                    new TypeReference<List<UserDeviceData>>() {}
            );
        });
    }

    public static String extractVpa(String token, String secretKey) {
        return extractClaim(token, secretKey, claims -> claims.get("vpa", String.class));
    }

    private static boolean isTokenExpired(String token, String secretKey) {
        return extractClaim(token, secretKey, Claims::getExpiration).before(new Date());
    }
}
