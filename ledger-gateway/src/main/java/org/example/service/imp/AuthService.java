package org.example.service.imp;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.transaction.annotation.Transactional;
import org.example.dto.UserDeviceData;
import org.example.dto.*;
import org.example.model.Enums;
import org.example.model.User;
import org.example.model.UserDevice;
import org.example.repository.DeviceRepository;
import org.example.repository.UserRepository;
import org.example.service.IAuth;
import org.example.utils.CookieUtil;
import org.example.utils.CryptoUtil;
import org.example.utils.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import redis.clients.jedis.JedisPool;
import software.amazon.awssdk.services.sns.SnsClient;
import org.example.utils.SendOtpUtil;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
public class AuthService implements IAuth {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    @Autowired
    private SnsClient snsClient;

    @Autowired
    private UserRepository userRepo;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private JedisPool pool;

    // ✅ RestTemplate initialized
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${jwt.secret-key}")
    private String jwtKey;

    //jwt time
    private final int exTime = 24 * 60 * 60; //in sec

    private final SecureRandom secureRandom = new SecureRandom();

    //converter UserDevice to UserDeviceData
    private UserDeviceData userDeviceToUserDeviceData(UserDevice userDevice) {
        UserDeviceData userDeviceData = new UserDeviceData();
        userDeviceData.setDeviceId(userDevice.getDeviceId());
        userDeviceData.setLastLoginIp(userDevice.getLastLoginIp());
        userDeviceData.setModelName(userDevice.getModelName());
        userDeviceData.setOsVersion(userDevice.getOsVersion());
        userDeviceData.setTrusted(userDevice.isTrusted());
        return userDeviceData;
    }

    // Build user response data map for frontend
    private Map<String, Object> buildUserResponseData(User user, List<UserDeviceData> devices, String jwt) {
        Map<String, Object> data = new HashMap<>();
        data.put("userId", user.getUserId());
        data.put("phoneNumber", user.getPhoneNumber());
        data.put("fullName", user.getFullName());
        data.put("vpa", user.getVpa());
        data.put("kycStatus", user.getKycStatus() != null ? user.getKycStatus().name() : "PENDING");
        data.put("createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : null);
        data.put("devices", devices);
        data.put("jwt", jwt);
        return data;
    }

    //save user into jwt and cookie
    private String jwtAndCookie(HttpServletResponse response, User user) {
        //1. jwt token gen

        String vpa = user.getVpa();
        if(vpa == null){
            vpa = "";
        }

        List<UserDevice> devices = deviceRepository.findByUser(user);
        List<UserDeviceData> userDeviceDatas = devices.stream().map(this::userDeviceToUserDeviceData).toList();
        String jwtToken = JwtUtil.generateJWTToken(jwtKey, exTime, user.getUserId(), user.getPhoneNumber(), user.getFullName(), userDeviceDatas, vpa);

        //2. save into cookie
        CookieUtil.createJwtCookie(response, jwtToken, exTime);

        //3. return
        return jwtToken;
    }

    //send otp for new device
    private Response sendOtpForNewDevice(PhoneReq req) {

        //1. get phono no
        String phoneNumber = req.getPhoneNumber();
        log.info("sendOtpToPhone started for phoneNumber={}", phoneNumber);

        return SendOtpUtil.sendOtp(phoneNumber, secureRandom, snsClient, pool.getResource(),"Ledger:"+ phoneNumber);
    }

    @Transactional
    public Response sendOtpToPhone(PhoneReq req) {

        //1. get phono no
        String phoneNumber = req.getPhoneNumber();
        log.info("sendOtpToPhone started for phoneNumber={}", phoneNumber);

        return SendOtpUtil.sendOtp(phoneNumber, secureRandom, snsClient, pool.getResource(),"Ledger:"+ phoneNumber);
    }

    @Transactional
    public Response checkOtpToPhone(PhoneOtpVerificationReq req) {

        //1. get user's entered data
        String phoneNumber = req.getPhoneNumber();
        String userOtp = req.getOtp();
        log.info("checkOtpToPhone called for phoneNumber={}", phoneNumber);

        //2. check user's present or not
//        TempUser tempUser = tempUserRepo.findByPhoneNumber(phoneNumber);
        String otp = pool.getResource().get("Ledger:" + phoneNumber);

        //3. verify via otp
        if (otp != null && otp.equals(userOtp)) {
            log.info("OTP verified successfully for phoneNumber={}", phoneNumber);

            User user = new User();
            user.setPhoneNumber(phoneNumber);
            user.setKycStatus(Enums.KycStatus.APPROVED);
            userRepo.save(user);

            log.info("TempUser deleted and User created. phoneNumber={}", phoneNumber);

            return new Response("OTP verified successfully", 200, null, null);
        }

        log.warn("OTP verification failed. phoneNumber={}", phoneNumber);
        return new Response("OTP verification failed", 400, null, null);
    }

    @Transactional
    public Response completeRegistration(HttpServletResponse response, CreateUserReq req) {
        //1. get user's data
        String phoneNumber = req.getPhoneNumber();
        String password = req.getPassword();
        String fullName = req.getFullName();
        String deviceId = req.getDeviceId();
        String lastLoginIp = req.getLastLoginIp();
        String modelName = req.getModelName();
        String osVersion = req.getOsVersion();
        log.info("completeRegistration started for phoneNumber={}", phoneNumber);

        //2. generate salt
        String salt = CryptoUtil.generateSalt();

        //3. hashed password
        String hashedPassword = CryptoUtil.hashMpinWithSalt(password, salt);

        //4. save user into db
        User user = userRepo.findByPhoneNumber(phoneNumber).orElse(null);
        if (user == null) {
            log.warn("User not found during registration. phoneNumber={}", phoneNumber);
            return new Response("User not found", 400, null, null);
        }

        log.info("User found, proceeding with registration. userId={}", user.getUserId());
        user.setSalt(salt);
        user.setPassword(hashedPassword);
        user.setFullName(fullName);
        user.setKycStatus(Enums.KycStatus.APPROVED);
        userRepo.save(user);

        //5. create user's device
        UserDevice userDevice = new UserDevice();
        userDevice.setDeviceId(deviceId);
        userDevice.setUser(user);
        userDevice.setTrusted(true);
        userDevice.setLastLoginIp(lastLoginIp);
        userDevice.setModelName(modelName);
        userDevice.setOsVersion(osVersion);
        deviceRepository.save(userDevice);
        log.info("New device registered. deviceId={}, userId={}",
                req.getDeviceId(), user.getUserId());

        List<UserDeviceData> devices = new ArrayList<>();
        devices.add(userDeviceToUserDeviceData(userDevice));

        //6. create jwt token
        String jwtToken = JwtUtil.generateJWTToken(jwtKey, exTime * 1000, user.getUserId(), user.getPhoneNumber(), user.getFullName(), devices, "");

        //7. saved into cookie
        CookieUtil.createJwtCookie(response, jwtToken, exTime);
        log.info("JWT generated and cookie set for userId={}", user.getUserId());

        // ✅ 8. TRIGGER GRAPH SYNC (ASYNC)
        CompletableFuture.runAsync(() -> {
            try {
                // If running Java in IDE + Python in Docker, use "http://localhost:8000"
                String url = "http://localhost:8000/sync/users";
                restTemplate.postForLocation(url, null);

                // Use 'user.getPhoneNumber()' NOT 'savedUser'
                log.info("🚀 Triggered Graph Sync for new user: {}", user.getPhoneNumber());
            } catch (Exception e) {
                log.warn("⚠️ Failed to trigger Graph Sync: {}", e.getMessage());
            }
        });

        return new Response(
                "User auto-login successful",
                200,
                null,
                buildUserResponseData(user, devices, jwtToken)
        );

    }

    @Transactional
    public Response login(HttpServletResponse response, LoginReq req) {
        //1. get data
        String phoneNumber = req.getPhoneNumber();
        String password = req.getPassword();
        String deviceId = req.getDeviceId();
        log.info("Login attempt. phoneNumber={}, deviceId={}", phoneNumber, deviceId);

        //2. check user exits or not
        User user = userRepo.findByPhoneNumber(phoneNumber).orElse(null);
        if (user == null) {
            log.warn("Login failed. User not found. phoneNumber={}", phoneNumber);
            return new Response("Invalid credentials", 401, null, null);
        }

        //3. check password
        String hashedPassword = CryptoUtil.hashMpinWithSalt(password, user.getSalt());
        if (!Objects.equals(user.getPassword(), hashedPassword)) {
            log.warn("Login failed. Invalid password. phoneNumber={}", phoneNumber);
            return new Response("Invalid password", 400, null, null);
        }

        //4. check a device
        if (deviceId == null) {
            return new Response("Device ID is required", 400, null, null);
        }

        //5. valid device
        Optional<UserDevice> device = deviceRepository.findByDeviceId(deviceId);

        if (device.isEmpty()) {

            log.info("New device detected, sending OTP. phoneNumber={}", phoneNumber);

            //6. send otp and verify device
            PhoneReq phoneVerificationReq = new PhoneReq();
            phoneVerificationReq.setPhoneNumber(phoneNumber);
            Response res = sendOtpForNewDevice(phoneVerificationReq);
            return new Response(res.getMessage(), res.getStatusCode(), res.getError(), res.getData());
        } else if (device.get().isTrusted()) {
            log.info("Trusted device login success. userId={}", user.getUserId());
            //7. jwt and cookie
            String jwtToken = jwtAndCookie(response, user);

            // Build user data for frontend
            List<UserDevice> devices = deviceRepository.findByUser(user);
            List<UserDeviceData> deviceDataList = devices.stream().map(this::userDeviceToUserDeviceData).toList();

            return new Response("Login successful", 200, null,
                    buildUserResponseData(user, deviceDataList, jwtToken)
            );
        }

        log.warn("Login failed. Untrusted device. phoneNumber={}", phoneNumber);

        return new Response(
                "InValid credentials",
                401,
                null,
                null
        );
    }

    //check otp during device changing
    @Transactional
    public Response changingDevice(HttpServletResponse response, DeviceChangeReq req) {
        //1. get details
        String phoneNumber = req.getPhoneNumber();
        String userOtp = req.getOtp();
        log.info("Device change started. otp={}", userOtp);
        log.info("Device change OTP verification started. phoneNumber={}", phoneNumber);

        //2. check user's present or not
        String otp = pool.getResource().get("Ledger:"+ phoneNumber);
        log.info("OTP from redis: {}", otp);

        //3. verify via otp
        if (otp != null && otp.equals(userOtp)) {
            log.info("Device change OTP verified. phoneNumber={}", phoneNumber);

            //4. get main user
            User user = userRepo.findByPhoneNumber(phoneNumber).orElse(null);

            if (user == null) {
                return new Response("User not found", 400, null, null);
            }

            //5. update old devices
            deviceRepository.updateDeviceByUserPhoneNumber(user.getPhoneNumber());
            log.info("All previous devices marked untrusted. userId={}", user.getUserId());

            //6. add new device
            UserDevice userDevice = new UserDevice();
            userDevice.setDeviceId(req.getDeviceId());
            userDevice.setUser(user);
            userDevice.setTrusted(true);
            userDevice.setLastLoginIp(req.getLastLoginIp());
            userDevice.setModelName(req.getModelName());
            userDevice.setOsVersion(req.getOsVersion());
            deviceRepository.save(userDevice);
            log.info("New device added and trusted. deviceId={}, userId={}",
                    req.getDeviceId(), user.getUserId());

            //7. jwt and cookie
            String jwtToken = jwtAndCookie(response, user);
            log.info("JWT regenerated after device change. userId={}", user.getUserId());

            // Build user data for frontend
            List<UserDevice> devices = deviceRepository.findByUser(user);
            List<UserDeviceData> deviceDataList = devices.stream().map(this::userDeviceToUserDeviceData).toList();

            return new Response("Login is successfully", 200, null,
                    buildUserResponseData(user, deviceDataList, jwtToken)
            );

        }
        log.warn("Device change OTP verification failed. phoneNumber={}", phoneNumber);
        return new Response("OTP verification failed", 400, null, null);

    }

    //logout
    public Response logout(HttpServletResponse response) {
        log.info("Logout requested");
        // remove jwt token from cookie
        CookieUtil.clearJwtCookie(response);
        log.info("JWT cookie cleared");
        return new Response("Logout successful", 200, null, null);
    }

}
