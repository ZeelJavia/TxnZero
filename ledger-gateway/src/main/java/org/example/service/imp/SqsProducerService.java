package org.example.service.imp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.dto.SmsNotificationTask;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

@Service
public class SqsProducerService {

    private final SqsClient sqsClient;
    private final ObjectMapper objectMapper;

    @Value("${aws.sqs.queue-url}")
    private String queueUrl;

    public SqsProducerService(SqsClient sqsClient, ObjectMapper objectMapper) {
        this.sqsClient = sqsClient;
        this.objectMapper = objectMapper;
    }

    public void queueSmsTask(SmsNotificationTask task) {
        try {
            // Convert DTO to JSON String
            String messageJson = objectMapper.writeValueAsString(task);

            SendMessageRequest sendMsgRequest = SendMessageRequest.builder()
                    .queueUrl(queueUrl)
                    .messageBody(messageJson)
                    .build();

            sqsClient.sendMessage(sendMsgRequest);
        } catch (Exception e) {
            // We don't throw exception here because the payment is ALREADY successful.
            // We just log it for manual retry.
            System.err.println("Failed to queue SMS: " + e.getMessage());
        }
    }
}