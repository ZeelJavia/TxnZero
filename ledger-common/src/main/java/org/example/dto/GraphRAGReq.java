package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GraphRAGReq {
    private String txnId;
    private float amount;
    private String payerVpa;
    private String payeeVpa;
    private String reason = "Money Laundering Pattern detected";
}


//txnId: str
//payerVpa: str
//payeeVpa: str
//amount: float
//reason: str