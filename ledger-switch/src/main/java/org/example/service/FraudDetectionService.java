package org.example.service;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.example.dto.PaymentRequest;
import org.example.model.SuspiciousEntity;
import org.example.repository.SuspiciousEntityRepository;
import org.neo4j.driver.Driver;
import org.neo4j.driver.Result;
import org.neo4j.driver.Session;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource; // ✅ CRITICAL IMPORT
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import org.springframework.transaction.annotation.Transactional;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import java.io.InputStream;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.LongStream;

/**
 * Hybrid Fraud Detection Engine
 * Layer 1: Deterministic Rules (Database Blocklist, Velocity Checks)
 * Layer 2: Probabilistic AI (Graph Neural Network via ONNX)
 */
@Service
@Slf4j
public class FraudDetectionService {

    @Autowired
    private SuspiciousEntityRepository suspiciousEntityRepository;

    @Autowired
    private Driver neo4jDriver;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${gateway.service.url:http://localhost:8080}")
    private String gatewayUrl;

    // ✅ INJECT THE MODEL FILE SAFELY USING SPRING
    // This finds the file in 'target/classes' or inside the JAR automatically.
    @Value("classpath:fraud_model_v2.onnx")
    private Resource modelResource;

    private JedisPool redisPool;
    private OrtEnvironment env;
    private OrtSession session;
    private final ObjectMapper mapper = new ObjectMapper();

    // Thresholds
    private static final double RULE_BASED_BLOCK_SCORE = 1.0;
    private static final double AI_FRAUD_THRESHOLD = 0.85;
    private static final double HIGH_VALUE_AMOUNT = 100000.0;

    @PostConstruct
    public void init() {
        try {
            log.info("🔍 STARTING AI INITIALIZATION...");

            // 1. Initialize Redis Pool
            this.redisPool = new JedisPool("localhost", 6379);

            // 2. Initialize AI Environment
            this.env = OrtEnvironment.getEnvironment();

            // ✅ 3. VERIFY FILE EXISTENCE
            if (!modelResource.exists()) {
                log.error("❌ FILE MISSING: Spring could not find 'fraud_model_v2.onnx' in the classpath.");
                log.error("👉 Please run 'mvn clean compile' to force the file copy.");
                throw new RuntimeException("Model file missing from build path");
            }

            // ✅ 4. LOAD MODEL (Using Spring Resource Stream)
            byte[] modelBytes;
            try (InputStream is = modelResource.getInputStream()) {
                modelBytes = is.readAllBytes();
            }

            // Safety Check: Detect Maven Corruption
            log.info("✅ Found Model File. Size: {} bytes", modelBytes.length);
            if (modelBytes.length < 1000) {
                throw new RuntimeException("❌ FILE CORRUPTED: Model is too small. Maven filtering might be damaging the binary file.");
            }

            // 5. Create Session
            this.session = env.createSession(modelBytes, new OrtSession.SessionOptions());

            log.info("🚀 AI Brain & Redis Loaded Successfully");

        } catch (Exception e) {
            log.error("❌ Failed to initialize AI Engine", e);
            throw new RuntimeException(e); // This stops the app start if AI fails
        }
    }

    @PreDestroy
    public void cleanup() {
        try {
            if (session != null) session.close();
            if (env != null) env.close();
            if (redisPool != null) redisPool.close();
        } catch (Exception e) {
            log.warn("Error closing resources", e);
        }
    }

    /**
     * Main Entry Point: Calculates Risk Score using Rules + AI
     */
    public double calculateRiskScore(PaymentRequest request) {
        if (request == null) return 0.0;

        // --- LAYER 1: HARD RULES (Fast Fail) ---

        if (request.getFraudCheckData() != null) {
            String ip = request.getFraudCheckData().getIpAddress();
            String deviceId = request.getFraudCheckData().getDeviceId();

            if (isEntityBlocked(ip) || isEntityBlocked(deviceId)) {
                log.warn("⛔ BLOCKED by Repository: IP/Device is in blocklist");
                return RULE_BASED_BLOCK_SCORE;
            }
        }

        if (request.getAmount() != null && request.getAmount().doubleValue() > HIGH_VALUE_AMOUNT) {
            log.info("⚠️ High Value Transaction Detected");
        }

        // --- LAYER 2: AI ENGINE (Smart Check) ---
        String userId = request.getPayerVpa();
        String targetUserId = request.getPayeeVpa();

        if (userId != null && targetUserId != null) {
            double aiRisk = runGraphAI(userId, targetUserId);
            if (aiRisk > AI_FRAUD_THRESHOLD) {
                log.warn("🤖 BLOCKED by AI: High Fraud Probability ({})", String.format("%.2f", aiRisk));
                return aiRisk;
            }
        }

        return 0.0;
    }

    /**
     * 🧠 The AI Logic: Redis Features + Neo4j Topology + ONNX Inference
     */
    private double runGraphAI(String userId, String targetUserId) {
        try (Jedis redis = redisPool.getResource()) {

            // 1. Fetch Raw Edges from Neo4j (Global IDs, e.g., 5973, 1042)
            List<Long> rawEdges = fetchSubgraphFromNeo4j(userId);

            // 2. Add the "Ghost Edge" (Current Transaction)
            long sourceNodeId = getNeo4jNodeId(userId);
            long targetNodeId = getNeo4jNodeId(targetUserId);

            rawEdges.add(sourceNodeId);
            rawEdges.add(targetNodeId);
            rawEdges.add(targetNodeId); // Undirected
            rawEdges.add(sourceNodeId);

            // =================================================================
            // 3. REMAPPING LOGIC (Global IDs -> Local Indices)
            // =================================================================

            // Map<GlobalID, LocalIndex>
            Map<Long, Integer> nodeMapping = new HashMap<>();
            List<Long> uniqueNodes = new ArrayList<>();

            // Rule: Source Node (Payer) MUST be Index 0
            nodeMapping.put(sourceNodeId, 0);
            uniqueNodes.add(sourceNodeId);

            int localIndexCounter = 1;
            List<Integer> remappedEdgeIndex = new ArrayList<>();

            for (Long globalId : rawEdges) {
                if (!nodeMapping.containsKey(globalId)) {
                    nodeMapping.put(globalId, localIndexCounter++);
                    uniqueNodes.add(globalId);
                }
                remappedEdgeIndex.add(nodeMapping.get(globalId));
            }

            // 4. Build Feature Matrix (x)
            int numNodes = uniqueNodes.size();
            float[] flattenFeatures = new float[numNodes * 2];

            for (int i = 0; i < numNodes; i++) {
                if (i == 0) {
                    // Source User: Fetch Real Features
                    float[] userFeatures = fetchFeaturesFromRedis(redis, userId);
                    flattenFeatures[0] = userFeatures[0];
                    flattenFeatures[1] = userFeatures[1];
                } else {
                    // Neighbors: Dummy Features [0,0] (Optimization)
                    flattenFeatures[i * 2] = 0.0f;
                    flattenFeatures[i * 2 + 1] = 0.0f;
                }
            }

            // 5. Run Inference
            double riskScore = runInference(flattenFeatures, numNodes, remappedEdgeIndex);

            // ✅ SUCCESS MESSAGE
            log.info("✅ AI Inference Successful. Risk Score: {}", String.format("%.4f", riskScore));

            return riskScore;

        } catch (Exception e) {
            log.error("⚠️ AI Engine Failure (Fail-Open): {}", e.getMessage());
            e.printStackTrace();
            return 0.0;
        }
    }

    private double runInference(float[] flattenFeatures, int numNodes, List<Integer> remappedEdgeIndex) throws Exception {

        // Create Tensors
        OnnxTensor x = OnnxTensor.createTensor(env, FloatBuffer.wrap(flattenFeatures), new long[]{numNodes, 2});

        int numEdges = remappedEdgeIndex.size() / 2;
        long[] srcs = new long[numEdges];
        long[] dsts = new long[numEdges];

        for (int i = 0; i < numEdges; i++) {
            srcs[i] = remappedEdgeIndex.get(2 * i);
            dsts[i] = remappedEdgeIndex.get(2 * i + 1);
        }

        long[] combined = LongStream.concat(LongStream.of(srcs), LongStream.of(dsts)).toArray();
        OnnxTensor edges = OnnxTensor.createTensor(env, LongBuffer.wrap(combined), new long[]{2, numEdges});

        var inputs = Map.of("x", x, "edge_index", edges);

        // Run Session
        try (var results = session.run(inputs)) {
            float[][] output = (float[][]) results.get(0).getValue();
            return output[0][1]; // Probability of Fraud for Node 0
        }
    }
    // --- 🛡️ AUTOMATED KILL SWITCH (Mule Ring Takedown) ---
    public void blockMuleRing(String sourceUserId, String targetUserId) {
        log.warn("🚨 FRAUD CONFIRMED: Initiating Mule Ring Takedown for {} and {}", sourceUserId, targetUserId);

        List<String> muleRing = new ArrayList<>();
        muleRing.add(sourceUserId);
        muleRing.add(targetUserId);

        // 1. Trace the web in Neo4j (Find accomplices within 2 hops)
        String query = """
            MATCH (u:User {userId: $uid})-[*1..2]-(accomplice:User)
            RETURN DISTINCT accomplice.userId as uid
        """;

        try (Session session = neo4jDriver.session()) {
            Result result = session.run(query, Map.of("uid", sourceUserId));
            while (result.hasNext()) {
                String accompliceId = result.next().get("uid").asString();
                muleRing.add(accompliceId);
            }
        } catch (Exception e) {
            log.error("Failed to trace mule ring in Neo4j", e);
        }

        // 2. Call Ledger-Gateway via REST to execute the block
        if (!muleRing.isEmpty()) {
            try {
                String url = gatewayUrl + "/api/internal/block-users";

                // Construct Payload
                Map<String, Object> payload = new HashMap<>();
                payload.put("userIds", muleRing);
                payload.put("reason", "Detected by AI Fraud Engine");

                // Send POST Request to Gateway
                restTemplate.postForEntity(url, payload, String.class);

                log.info("✅ KILL SWITCH EXECUTED: Gateway blocked {} users.", muleRing.size());
            } catch (Exception e) {
                log.error("❌ FAILED to contact Gateway for blocking: {}", e.getMessage());
            }
        }
    }

    // --- Helper Methods ---

    private float[] fetchFeaturesFromRedis(Jedis redis, String userId) {
        try {
            String json = redis.get("user:" + userId + ":features");
            if (json != null) {
                return mapper.readValue(json, float[].class);
            }
        } catch (Exception e) {
            log.warn("Redis fetch error for user {}", userId);
        }
        return new float[]{0.0f, 1.0f};
    }

    private List<Long> fetchSubgraphFromNeo4j(String userId) {
        List<Long> edges = new ArrayList<>();
        String query = """
            MATCH (u:User {userId: $uid})-[r*1..2]-(n)
            RETURN id(startNode(last(r))) as src, id(endNode(last(r))) as dst
            LIMIT 50
        """;

        try (Session session = neo4jDriver.session()) {
            Result result = session.run(query, Map.of("uid", userId));
            while (result.hasNext()) {
                var rec = result.next();
                edges.add(rec.get("src").asLong());
                edges.add(rec.get("dst").asLong());
            }
        }
        return edges;
    }

    private long getNeo4jNodeId(String userId) {
        try (Session session = neo4jDriver.session()) {
            return session.run("MERGE (u:User {userId: $uid}) RETURN id(u)",
                    Map.of("uid", userId)).single().get(0).asLong();
        }
    }


    @Transactional(readOnly = true)
    public boolean isEntityBlocked(String entityValue) {
        if (entityValue == null) return false;
        Optional<SuspiciousEntity> entity = suspiciousEntityRepository.findByEntityValue(entityValue);
        return entity.isPresent() &&
                entity.get().getBlockedUntil() != null &&
                entity.get().getBlockedUntil().isAfter(LocalDateTime.now());
    }
}