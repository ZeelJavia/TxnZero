package org.example.service;

import org.example.client.BankClient;
import org.example.dto.BankClientReq;
import org.example.dto.PinBankReq;
import org.example.dto.Response;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AccountLinkService {

    private final List<String> banks = new ArrayList<>(Arrays.asList("SBI", "AXIS"));
    private final BankClient bankClient;

    public AccountLinkService(BankClient bankClient) {
        this.bankClient = bankClient;
    }

    //for bank dropdown
    public Response getAllBanks(){
        return new Response(
                "all available banks",
                200,
                null,
                Collections.singletonMap("banks", banks)
        );
    }


    //call bank - phoneNo to fetch account
    public Response getAccount(BankClientReq req){
        return bankClient.getAccount(req);
    }

    //generate vpa
    public Response generateVPA(BankClientReq req){
        return bankClient.generateVPA(req);
    }

    //set pin
    public Response setMpin(PinBankReq req){ return bankClient.setMPin(req); }
}
