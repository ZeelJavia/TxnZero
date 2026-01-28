# 🏦 LedgerZero: AI-Powered Financial Switch & Fraud Defense

Java
Spring Boot
Python
FastAPI
Neo4j
Docker

**LedgerZero** is a high-performance, cloud-native financial switch designed to process transactions with sub-millisecond latency while detecting sophisticated fraud patterns in real-time. It leverages a **Hybrid AI Defense System** combining Graph Neural Networks (GNN), Reinforcement Learning (RL), and Generative AI (GraphRAG).

---

## 🚀 The Solution: 4-Layer Hybrid Defense

Traditional fraud detection relies on static rules. LedgerZero introduces a dynamic, self-learning pipeline:

| Layer | Component | Technology | Role |
| :--- | :--- | :--- | :--- |
| **1** | **Velocity Checks** | Redis + Rules | **Speed:** Instantly blocks blacklisted IPs/Devices and high-frequency spam. |
| **2** | **Network Intelligence** | Neo4j + GNN (ONNX) | **Insight:** Analyzes graph topology to detect Money Mule Rings and hidden relationships. |
| **3** | **Smart Judge** | RL Agent (PPO) | **Strategy:** Weighs risk vs. history to make the final call (Allow/Challenge/Block), reducing false positives. |
| **4** | **Forensics** | GraphRAG (LangChain) | **Explanation:** Generates human-readable reports explaining *why* a transaction was blocked. |

---

## 🏗️ System Architecture

The system consists of two primary microservices and a suite of infrastructure containers.

### 1. Ledger Switch (Java/Spring Boot)
* **Core Core:** Handles transaction routing (`/transfer`), debit/credit logic, and SMS notifications.
* **AI Execution:** Embeds ONNX models directly for ultra-low latency inference (no external API calls for decisioning).
* **Feedback Loop:** Writes transaction outcomes to Redis to "teach" the RL Agent.

### 2. Sync & Intelligence Engine (Python/FastAPI)
* **Graph Sync:** Listens to PostgreSQL and updates Neo4j in near real-time.
* **GraphRAG:** Provides the `/investigate` endpoint for generative forensic reports.
* **Training Ground:** (Optional) Re-trains RL agents based on new data.

### 3. Infrastructure
* **PostgreSQL:** Primary/Read-Replica setup for transactional integrity.
* **Redis:** Feature store for user profiles and RL state.
* **Neo4j:** Graph database for storing transaction relationships.
* **Prometheus & Grafana:** Full-stack observability.

---

## 🛠️ Tech Stack

* **Backend:** Java 21, Spring Boot 3.x, Maven
* **AI/ML:** Python 3.11, PyTorch, Stable Baselines3, ONNX Runtime, LangChain
* **Databases:** PostgreSQL 16, Redis 7 (Alpine), Neo4j 5.16
* **DevOps:** Docker, Docker Compose
* **Monitoring:** Prometheus, Grafana, cAdvisor

---

## ⚡ Getting Started

### Prerequisites
* Docker & Docker Compose
* Java 21 JDK
* Maven
