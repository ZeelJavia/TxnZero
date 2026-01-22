package org.example.controller;

import jakarta.servlet.http.HttpServletResponse;
import org.example.dto.*;
import org.example.service.IAuth;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final IAuth authService;

    public AuthController(IAuth authService) {
        this.authService = authService;
    }

    @PostMapping("/send-otp")
    public Response sendOtp(@RequestBody PhoneOtpVerificationReq req) {
        return authService.sendOtpToPhone(req);
    }

    @PostMapping("/check-otp")
    public  Response checkOtp(@RequestBody PhoneOtpVerificationReq req){
        return authService.checkOtpToPhone(req);
    }

    @PostMapping("/register")
    public Response completeRegistration(HttpServletResponse response, @RequestBody CreateUserReq req) {
        return authService.completeRegistration(response, req);
    }

    @PostMapping("/login")
    public Response login(HttpServletResponse response, @RequestBody LoginReq req){
        return authService.login(response, req);
    }

    @PostMapping("/logout")
    public Response logout(HttpServletResponse response){
        return authService.logout(response);
    }

    @PostMapping("/change-device")
    public Response changingDevice(HttpServletResponse response, @RequestBody DeviceChangeReq req){
        return authService.changingDevice(response, req);
    }




}
