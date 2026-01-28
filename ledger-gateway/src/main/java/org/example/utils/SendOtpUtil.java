package org.example.utils;

import org.example.dto.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import redis.clients.jedis.Jedis;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;

import java.security.SecureRandom;

public class SendOtpUtil { ;
    private static final Logger log = LoggerFactory.getLogger(SendOtpUtil.class);

    public static Response sendOtp(String phoneNumber, SecureRandom secureRandom, SnsClient snsClient, Jedis jedis, String key){
        phoneNumber = PhoneNumberUtil.setCode(phoneNumber);

        //1. otp gen
        int otpValue = 100000 + secureRandom.nextInt(900000); // Always 6 digits
        String otp = String.valueOf(otpValue);

        //2. set otp
        jedis.set(key,otp);
        jedis.expire(key,600); //10 minutes

        log.info("OTP stored temporarily for phoneNumber={}", phoneNumber);

        try {
            // 4. Call AWS SNS
            PublishResponse result = snsClient.publish(
                    PublishRequest.builder()
                            .message("Your LedgerZero Verification OTP is: " + otp)
                            .phoneNumber(PhoneNumberUtil.setCode(phoneNumber))
                            .build()
            );

            log.info("OTP sent successfully. phoneNumber={}, messageId={}",
                    phoneNumber, result.messageId());

            return new Response("OTP sent to " + phoneNumber, 200, null, null);
        } catch (Exception e) {
            log.error("Error while sending OTP. phoneNumber={}", phoneNumber, e);
            return new Response("Error found", 500, e.toString(), null);
        }
    }
}
