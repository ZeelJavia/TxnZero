package org.example.service.imp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.dto.SmsNotificationTask;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;

import java.util.List;

@Service
public class SqsConsumerService {

    private final SqsClient sqsClient;
    private final SnsClient snsClient;
    private final ObjectMapper objectMapper;

    @Value("${aws.sqs.queue-url}")
    private String queueUrl;

    public SqsConsumerService(SqsClient sqsClient, SnsClient snsClient, ObjectMapper objectMapper) {
        this.sqsClient = sqsClient;
        this.snsClient = snsClient;
        this.objectMapper = objectMapper;
    }

    // Runs every 5 seconds to check the queue
    @Scheduled(fixedDelay = 5000)
    public void processSmsQueue() {
        ReceiveMessageRequest receiveRequest = ReceiveMessageRequest.builder()
                .queueUrl(queueUrl)
                .maxNumberOfMessages(5) // Process 5 at a time
                .waitTimeSeconds(10)    // Long polling
                .build();

        List<Message> messages = sqsClient.receiveMessage(receiveRequest).messages();

        for (Message message : messages) {
            try {
                // 1. Parse JSON back to DTO
                SmsNotificationTask task = objectMapper.readValue(message.body(), SmsNotificationTask.class);

                // 2. Build the Bank SMS message
                String smsContent = String.format(
                        "Txn: %s. A/c %s %sed for INR %s. Avl Bal: INR %s.",
                        task.getType(), task.getAccountNumber(), task.getType().toLowerCase(),
                        task.getAmount(), task.getRemainingBalance()
                );

                // 3. Send via SNS
                snsClient.publish(PublishRequest.builder()
                        .message(smsContent)
                        .phoneNumber(task.getPhoneNumber())
                        .build());

                // 4. DELETE from queue so it's not processed again
                sqsClient.deleteMessage(builder -> builder.queueUrl(queueUrl).receiptHandle(message.receiptHandle()));

            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}