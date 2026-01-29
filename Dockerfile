# ================================
# STAGE 1 — Build Spring Boot JAR
# ================================
FROM maven:3.9.6-eclipse-temurin-21 AS builder

WORKDIR /app

# Copy parent pom and all services
COPY pom.xml .
COPY ledger-common ledger-common
COPY ledger-gateway ledger-gateway
COPY ledger-switch ledger-switch
COPY ledger-bank ledger-bank

# Build only the requested service
ARG SERVICE_NAME

RUN mvn -pl ${SERVICE_NAME} -am clean package -DskipTests

# ================================
# STAGE 2 — Runtime
# ================================
FROM eclipse-temurin:21-jre

WORKDIR /app

ARG SERVICE_NAME

# Copy built jar
COPY --from=builder /app/${SERVICE_NAME}/target/*.jar app.jar

# JVM Memory + GC optimized for containers
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75 -XX:+UseG1GC"

# Expose dynamic port
EXPOSE 8080

# Health check (Spring Boot Actuator)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD curl -f http://localhost:${SERVER_PORT:-8080}/actuator/health || exit 1

# Run
ENTRYPOINT ["sh", "-c", "java $JAVA_TOOL_OPTIONS -jar app.jar"]
