package org.example.service.imp;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.client.SwitchClient;
import org.example.dto.UserDeviceData;
import org.example.dto.*;
import org.example.model.User;
import org.example.model.UserDevice;
import org.example.repository.DeviceRepository;
import org.example.repository.UserRepository;
import org.example.utils.CookieUtil;
import org.example.utils.JwtUtil;
import org.example.utils.SendOtpUtil;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional; // ✅ Import this
import redis.clients.jedis.JedisPool;
import software.amazon.awssdk.services.sns.SnsClient;

import java.security.SecureRandom;
import java.util.List;

import static org.slf4j.LoggerFactory.getLogger;

@Service
public class AccountLinkService {

    private final SwitchClient switchClient;
    private final SecureRandom secureRandom = new SecureRandom();
    private final SnsClient snsClient;
    private final UserRepository userRepository;
    private final DeviceRepository deviceRepository;
    private static final Logger log = getLogger(AccountLinkService.class);
    @Value("${jwt.secret-key}")
    private String jwtKey;
    private final JedisPool pool;

    private final int exTime = 24 * 60 * 60;

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

    public AccountLinkService(SwitchClient switchClient, SnsClient snsClient, UserRepository userRepository, DeviceRepository deviceRepository, JedisPool pool) {
        this.switchClient = switchClient;
        this.snsClient = snsClient;
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
        this.pool = pool;
    }

    // ✅ READ-ONLY: Static bank data -> REPLICA
    @Transactional(readOnly = true)
    public Response getAllBanks() {
        return switchClient.getAllBanks();
    }

    // ✅ READ-ONLY: Checking account existence -> REPLICA
    // (Note: Sending OTP is an SNS call, not a DB write)
    @Transactional
    public Response sendOtpToPhoneNumber(HttpServletRequest httpServletRequest, BankHandlerReq req) {
        //1. get phoneNumber
        String phoneNumber = httpServletRequest.getAttribute("phoneNumber").toString();

        BankClientReq clientReq = new BankClientReq();
        clientReq.setBankHandle(req.getBankHandle());
        clientReq.setPhoneNumber(phoneNumber);

        //2. get status
        Response res = switchClient.accountIsExits(clientReq);
        log.info("Account status for phoneNumber={} is {} and data is {}", phoneNumber, res.getStatusCode(), res.getData());

        //3. check exits or not
        if (res.getStatusCode() == 200 && res.getData().get("isExits").equals(true)) {

            //4. if yes send otp
            return SendOtpUtil.sendOtp(phoneNumber, secureRandom, snsClient, pool.getResource(), "Ledger:"+ phoneNumber);
        } else {

            //5. account is not exits
            return new Response(
                    "No account found",
                    404,
                    null,
                    null
            );
        }
    }

    // ❌ WRITE: Deletes TempUser, Saves User VPA -> PRIMARY
    @Transactional
    public Response checkOtpAndGenerateVPA(HttpServletRequest httpServletRequest, HttpServletResponse httpServletResponse, BankHandlerVerificationReq req) {
        log.info("requested data is : {} ", req.toString());

        //1. get user's entered data
        String phoneNumber = httpServletRequest.getAttribute("phoneNumber").toString();
        String userOtp = req.getOtp();
        log.info("checkOtpToPhone called for phoneNumber={}", phoneNumber);

        //2. check user's present or not
        String otp = pool.getResource().get("Ledger:" + phoneNumber);

        //3. verify via otp
        if (otp != null && otp.equals(userOtp)) {


            //5. send req to switch proceed with generate vpa and save
            BankClientReq clientReq = new BankClientReq();
            clientReq.setBankHandle(req.getBankHandle());
            clientReq.setPhoneNumber(phoneNumber);

            Response response = switchClient.VPAGenerate(clientReq);
            log.info("response from switch is : {} ", response.toString());

            //6. get vpa of user
            String vpa = response.getData().get("vpa").toString();
            log.info("vpa of user is : {} ", vpa);

            //7. store into user
            User user = userRepository.findByPhoneNumber(phoneNumber).orElse(null);

            if (user == null) {
                return new Response("User not found", 400, null, null);
            }

            //8. set user
            user.setVpa(vpa);
            userRepository.save(user);

            List<UserDevice> devices = deviceRepository.findByUser(user);
            List<UserDeviceData> userDeviceDatas = devices.stream().map(this::userDeviceToUserDeviceData).toList();

            //9. gen jwt and save jwt
            String jwtToken = JwtUtil.generateJWTToken(jwtKey, exTime, user.getUserId(), user.getPhoneNumber(), user.getFullName(), userDeviceDatas, vpa);

            CookieUtil.createJwtCookie(httpServletResponse, jwtToken, exTime);

            return response;
        }

        //10. 500
        return new Response(
                "otp invalid",
                400,
                null,
                null
        );
    }

    /**
     * set mpin
     */
    // ❌ WRITE: Updates MPIN -> PRIMARY
    @Transactional
    public Response setMpinToAccount(HttpServletRequest request, PinBankReq bankReq) {
        //1. get data
        String vpa = request.getAttribute("vpa").toString();
        String phoneNumber = request.getAttribute("phoneNumber").toString();

        log.info("bankReq is {}", bankReq);

        //2. set to bankReq
        bankReq.setVpa(vpa);
        bankReq.setPhoneNumber(phoneNumber);

        //3. call switchClient
        return switchClient.setMPin(bankReq);
    }

    /**
     * Get all linked bank accounts for the authenticated user. Routes through
     * Switch to get all VPAs and balances.
     */
    // ✅ READ-ONLY: History data -> REPLICA
    @Transactional(readOnly = true)
    public Response getLinkedAccounts(HttpServletRequest request) {
        String phoneNumber = request.getAttribute("phoneNumber").toString();
        log.info("Getting linked accounts for phoneNumber={}", phoneNumber);
        return switchClient.getLinkedAccounts(phoneNumber);
    }

    /**
     * Get balance for the user's VPA.
     */
    // ✅ READ-ONLY (Gateway Side):
    // Gateway only fetches 'User' VPA metadata here.
    // The REAL critical balance check happens in 'SwitchClient', which is a separate service.
    // So for Gateway's DB, this is a safe Read.
    @Transactional(readOnly = true)
    public Response getBalance(HttpServletRequest request) {
        String vpa = (String) request.getAttribute("vpa");

        // If VPA not in JWT, look it up from database
        if (vpa == null || vpa.isEmpty()) {
            Long userId = (Long) request.getAttribute("userId");
            if (userId != null) {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && user.getVpa() != null) {
                    vpa = user.getVpa();
                }
            }
        }

        log.info("Getting balance for vpa={}", vpa);

        if (vpa == null || vpa.isEmpty()) {
            return new Response("No VPA linked to account", 400, null, null);
        }

        BalanceResponse balance = switchClient.getBalance(vpa);
        if (balance == null) {
            return new Response("Failed to get balance", 500, null, null);
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("vpa", balance.getVpa());
        data.put("balance", balance.getBalance());
        data.put("bankHandle", balance.getBankHandle());
        data.put("bankName", balance.getBankName());
        data.put("maskedAccountNumber", balance.getMaskedAccountNumber());

        return new Response("Balance retrieved successfully", 200, null, data);
    }

    /**
     * Get transaction history for the user's VPA.
     */
    // ✅ READ-ONLY: History data -> REPLICA
    @Transactional(readOnly = true)
    public Response getTransactionHistory(HttpServletRequest request, int page, int limit) {
        String vpa = (String) request.getAttribute("vpa");

        // If VPA not in JWT, look it up from database
        if (vpa == null || vpa.isEmpty()) {
            Long userId = (Long) request.getAttribute("userId");
            if (userId != null) {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && user.getVpa() != null) {
                    vpa = user.getVpa();
                }
            }
        }

        log.info("Getting transaction history for vpa={}", vpa);

        if (vpa == null || vpa.isEmpty()) {
            return new Response("No VPA linked to account", 400, null, null);
        }

        return switchClient.getTransactionHistory(vpa, page, limit);
    }

    @Transactional(readOnly = true)
    public Response getTransactionHistory(HttpServletRequest request) {
        String vpa = (String) request.getAttribute("vpa");

        // If VPA not in JWT, look it up from database
        if (vpa == null || vpa.isEmpty()) {
            Long userId = (Long) request.getAttribute("userId");
            if (userId != null) {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && user.getVpa() != null) {
                    vpa = user.getVpa();
                }
            }
        }

        log.info("Getting transaction history for vpa={}", vpa);

        if (vpa == null || vpa.isEmpty()) {
            return new Response("No VPA linked to account", 400, null, null);
        }

        return switchClient.getTransactionHistory(vpa);
    }

}