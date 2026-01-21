package org.example.utils;

public class PhoneNumberUtil {

    public static String setCode(String ph){
        String phoneNumber = ph;
        if(!phoneNumber.startsWith("+91")){
            phoneNumber = "+91"+phoneNumber;
        }
        return phoneNumber;
    }
}
