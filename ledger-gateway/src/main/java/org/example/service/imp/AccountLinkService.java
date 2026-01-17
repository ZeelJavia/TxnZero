package org.example.service.imp;


import jakarta.servlet.http.HttpServletRequest;
import org.example.client.SwitchClient;
import org.example.dto.*;
import org.example.model.TempUser;
import org.example.model.User;
import org.example.repository.TempUserRepo;
import org.example.repository.UserRepository;
import org.example.utils.JwtUtil;
import org.example.utils.SendOtpUtil;
import org.slf4j.Logger;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sns.SnsClient;

import java.security.SecureRandom;

import static org.slf4j.LoggerFactory.getLogger;

@Service
public class AccountLinkService {

    private final SwitchClient switchClient;
    private final SecureRandom secureRandom = new SecureRandom();
    private final SnsClient snsClient;
    private final TempUserRepo tempUserRepo;
    private final UserRepository userRepository;
    private static final Logger log = getLogger(AccountLinkService.class);

    public AccountLinkService(SwitchClient switchClient, SnsClient snsClient, TempUserRepo tempUserRepo, UserRepository userRepository) {
        this.switchClient = switchClient;
        this.snsClient = snsClient;
        this.tempUserRepo = tempUserRepo;
        this.userRepository = userRepository;
    }

    //Get all available banks
    public Response getAllBanks(){
        return switchClient.getAllBanks();
    }

    //get phone no which is connected to bank
    public Response sendOtpToPhoneNumber(HttpServletRequest httpServletRequest, BankHandlerReq req){
        //1. get phoneNumber
        String phoneNumber = httpServletRequest.getAttribute("phoneNumber").toString();

        BankClientReq clientReq = new BankClientReq();
        clientReq.setBankHandle(req.getBankHandle());
        clientReq.setPhoneNumber(phoneNumber);

        //2. get status
        Response res = switchClient.accountIsExits(clientReq);
        log.info("Account status for phoneNumber={} is {} and data is {}", phoneNumber, res.getData().get("status"), res.getData());

        //3. check exits or not
        if(res.getStatusCode() == 200 && res.getData().get("isExits").equals(true)){

            //4. if yes send otp
            return SendOtpUtil.sendOtp(phoneNumber, secureRandom,tempUserRepo, snsClient);
        }else{

            //5. account is not exits
            return new Response(
                    "No account found",
                    404,
                    null,
                    null
            );
        }
    }

    //OtpVerification
    public Response checkOtpAndGenerateVPA(HttpServletRequest httpServletRequest, BankHandlerVerificationReq req){
        log.info("requested data is : {} ", req.toString());

        //1. get user's entered data
        String phoneNumber = httpServletRequest.getAttribute("phoneNumber").toString();
        String otp = req.getOtp();
        log.info("checkOtpToPhone called for phoneNumber={}", phoneNumber);

        //2. check user's present or not
        TempUser tempUser = tempUserRepo.findByPhoneNumber(phoneNumber);

        //3. verify via otp
        if(tempUser != null && tempUser.getOtp().equals(otp)){
            //4. remove user from tempUser
            tempUserRepo.delete(tempUser);

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

            if(user == null){
                return new Response("User not found", 400, null, null);
            }

            //8. set user
            user.setVpa(vpa);
            userRepository.save(user);
            return response;
        }

        //9. 500
        return new Response(
                "otp invalid",
                400,
                null,
                null
        );
    }

}
