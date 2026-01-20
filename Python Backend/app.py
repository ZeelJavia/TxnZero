import os
import logging
import psycopg2
import pandas as pd
import redis
import json
from fastapi import FastAPI, BackgroundTasks, HTTPException
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("GraphSyncAPI")

# DB Credentials
RDS_HOST = os.getenv("RDS_HOST", "localhost")
RDS_PORT = int(os.getenv("RDS_PORT", 5432))
RDS_USER = os.getenv("RDS_USER", "postgres")
RDS_PASSWORD = os.getenv("RDS_PASSWORD", "password")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_AUTH = ("neo4j", os.getenv("password", "password"))

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

app = FastAPI(title="LedgerZero Graph Sync Engine")

# --- THE SYNC ENGINE CLASS ---
class GraphSyncService:
    def __init__(self):
        # 1. Neo4j & Redis
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)
        self.redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
        self.state = self.load_state()

        # 2. Persistent Postgres Connections
        self.gateway_conn = None
        self.switch_conn = None
        self.connect_postgres()

    def connect_postgres(self):
        """Establishes persistent connections"""
        try:
            logger.info("🔌 Connecting to PostgreSQL...")
            if not self.gateway_conn or self.gateway_conn.closed:
                self.gateway_conn = psycopg2.connect(
                    host=RDS_HOST, database="gateway_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            if not self.switch_conn or self.switch_conn.closed:
                self.switch_conn = psycopg2.connect(
                    host=RDS_HOST, database="switch_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            logger.info("✅ PostgreSQL Connected (Persistent).")
        except Exception as e:
            logger.error(f"❌ DB Init Failed: {e}")

    def ensure_conn(self):
        """Reconnects if connection is explicitly closed"""
        if self.gateway_conn is None or self.gateway_conn.closed:
            self.connect_postgres()
        if self.switch_conn is None or self.switch_conn.closed:
            self.connect_postgres()

    def load_state(self):
        try:
            return {
                "last_user_time": self.redis_client.get("sync:last_user_time") or "2023-01-01 00:00:00",
                "last_txn_time": self.redis_client.get("sync:last_txn_time") or "2023-01-01 00:00:00"
            }
        except Exception:
            return {"last_user_time": "2023-01-01", "last_txn_time": "2023-01-01"}

    def save_state(self, key, value):
        try:
            self.state[key] = str(value)
            self.redis_client.set(f"sync:{key}", str(value))
        except Exception:
            pass

    # --- WORKER METHODS ---

    def sync_users(self, force=False):
        """
        Syncs users from Postgres -> Neo4j & Redis.
        If force=True, ignores the timestamp and resyncs ALL users.
        """
        try:
            self.ensure_conn()
            
            # ✅ LOGIC: If force=True, ignore time and fetch ALL users
            if force:
                logger.info("⚠️ FORCING FULL USER SYNC (Ignoring Timestamps)...")
                query = "SELECT user_id, phone_number, kyc_status, risk_score, created_at FROM users ORDER BY created_at ASC LIMIT 1000"
            else:
                query = f"SELECT user_id, phone_number, kyc_status, risk_score, created_at FROM users WHERE created_at > '{self.state['last_user_time']}' ORDER BY created_at ASC LIMIT 1000"
            
            df = pd.read_sql(query, self.gateway_conn)
            if df.empty: 
                logger.info("✅ No new users to sync.")
                return

            logger.info(f"🔄 Syncing {len(df)} Users...")
            
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    # 1. Normalize Data
                    phone_str = str(row['phone_number']).replace("+91", "").strip()
                    
                    # Risk: Normalize 0-100 -> 0.0-1.0. Handle NaN/Null safely.
                    try:
                        raw_risk = float(row['risk_score'])
                        if pd.isna(raw_risk): raw_risk = 0.0
                    except (ValueError, TypeError):
                        raw_risk = 0.0
                        
                    normalized_risk = raw_risk / 100.0 
                    
                    kyc_val = 1.0 if str(row['kyc_status']) == "VERIFIED" else 0.0
                    
                    # ✅ IDENTITY: Use VPA as the unified ID
                    estimated_vpa = f"{phone_str}@okaxis"

                    # 2. Update Neo4j (Graph Topology)
                    session.run("""
                        MERGE (u:User {userId: $vpa})
                        SET u.phone = $phone, 
                            u.kyc = $kyc, 
                            u.riskScore = $risk,
                            u.postgresId = $pid
                    """, vpa=estimated_vpa, phone=phone_str, kyc=kyc_val, risk=normalized_risk, pid=str(row['user_id']))

                    # ✅ 3. WRITE TO REDIS (Critical for Java AI)
                    # Key format must match Java: "user:{userId}:features"
                    redis_key = f"user:{estimated_vpa}:features"
                    feature_vector = [normalized_risk, kyc_val]
                    
                    self.redis_client.set(redis_key, json.dumps(feature_vector))
                    logger.info(f"💾 Redis updated for {estimated_vpa}: {feature_vector}")
            
            # Update state only if we aren't forcing (to preserve incremental logic)
            if not force:
                self.save_state('last_user_time', df.iloc[-1]['created_at'])
            
            logger.info(f"✅ Users synced successfully.")

        except Exception as e:
            logger.error(f"❌ User Sync Error: {e}")
            self.gateway_conn = None

    def sync_transactions(self):
        try:
            self.ensure_conn()
            # ✅ CHANGE 1: Fetch 'ml_fraud_score' from the transactions table
            # We filter for SUCCESS or BLOCKED_FRAUD (to catch the bad attempts too)
            query = f"""
                SELECT global_txn_id, payer_vpa, payee_vpa, amount, ml_fraud_score, created_at 
                FROM transactions 
                WHERE created_at > '{self.state['last_txn_time']}' 
                AND (status = 'SUCCESS' OR status = 'BLOCKED_FRAUD')
                ORDER BY created_at ASC LIMIT 1000
            """
            
            df = pd.read_sql(query, self.switch_conn)
            if df.empty: return

            logger.info(f"🔄 Syncing {len(df)} New Txns (Updating User Risk)...")
            
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    # 1. Sync Graph Topology (Neo4j)
                    session.run("""
                        MERGE (s:User {userId: $payer})
                        MERGE (r:User {userId: $payee})
                        MERGE (s)-[:TRANSACTED_WITH {txnId: $tid, amount: toFloat($amt), ts: $ts, risk: toFloat($risk)}]->(r)
                    """, payer=row['payer_vpa'], payee=row['payee_vpa'], tid=row['global_txn_id'], amt=row['amount'], ts=str(row['created_at']), risk=row['ml_fraud_score'])
                    
                    # ==========================================================
                    # ✅ CHANGE 2: DYNAMIC USER RISK UPDATE (Feedback Loop)
                    # ==========================================================
                    try:
                        txn_risk = float(row['ml_fraud_score']) if row['ml_fraud_score'] else 0.0
                        
                        # Only update if the transaction was actually risky (> 0.50)
                        if txn_risk > 0.50:
                            payer_vpa = str(row['payer_vpa'])
                            # Extract phone from VPA (Assuming format: 9023...@okaxis)
                            phone_extracted = payer_vpa.split('@')[0]
                            
                            logger.info(f"⚠️ High Risk Txn detected ({txn_risk}) for {payer_vpa}. Updating Profile...")

                            # A. Update Postgres (Gateway DB) - Permanent Record
                            # We set the user's risk to the Max of current or new (Never lower it automatically)
                            update_sql = f"""
                                UPDATE users 
                                SET risk_score = GREATEST(risk_score, {txn_risk * 100}) 
                                WHERE phone_number LIKE '%{phone_extracted}'
                            """
                            with self.gateway_conn.cursor() as cursor:
                                cursor.execute(update_sql)
                                self.gateway_conn.commit()

                            # B. Update Redis (AI Brain) - Immediate Effect
                            # We need to fetch the existing KYC status to preserve it
                            redis_key = f"user:{payer_vpa}:features"
                            current_features = self.redis_client.get(redis_key)
                            
                            kyc_val = 0.0 # Default
                            if current_features:
                                try:
                                    # Existing format: [Risk, KYC]
                                    data = json.loads(current_features)
                                    kyc_val = data[1] 
                                except:
                                    pass
                            
                            # Save new High Risk Score to Redis
                            new_features = [txn_risk, kyc_val]
                            self.redis_client.set(redis_key, json.dumps(new_features))
                            logger.info(f"🔥 BURNED: Updated Redis Risk for {payer_vpa} -> {new_features}")

                    except Exception as risk_err:
                        logger.error(f"Failed to update user risk: {risk_err}")

            self.save_state('last_txn_time', df.iloc[-1]['created_at'])
            logger.info(f"✅ Transactions synced up to {df.iloc[-1]['created_at']}")

        except Exception as e:
            logger.error(f"❌ Txn Sync Error: {e}")
            self.switch_conn = None

# --- INITIALIZATION ---
sync_service = None

@app.on_event("startup")
def startup():
    global sync_service
    sync_service = GraphSyncService()
    logger.info("✅ Graph Sync Engine Ready")

@app.on_event("shutdown")
def shutdown():
    if sync_service:
        if sync_service.driver: sync_service.driver.close()
        if sync_service.gateway_conn: sync_service.gateway_conn.close()
        if sync_service.switch_conn: sync_service.switch_conn.close()

# --- API ENDPOINTS ---

@app.post("/sync/users")
async def trigger_user_sync(background_tasks: BackgroundTasks):
    """Triggered by Gateway when new user registers"""
    if sync_service:
        background_tasks.add_task(sync_service.sync_users)
    return {"status": "Accepted", "message": "User sync queued"}

@app.post("/sync/transactions")
async def trigger_txn_sync(background_tasks: BackgroundTasks):
    """Triggered by Switch when payment succeeds"""
    if sync_service:
        background_tasks.add_task(sync_service.sync_transactions)
    return {"status": "Accepted", "message": "Txn sync queued"}

@app.post("/sync/all")
async def trigger_full_sync(background_tasks: BackgroundTasks):
    """Manual full sync - Forces re-read of all user data"""
    if sync_service:
        # ✅ Forces full sync of users (ignoring time) to update Redis Features
        background_tasks.add_task(sync_service.sync_users, force=True)
        # Transactions usually just need incremental sync
        background_tasks.add_task(sync_service.sync_transactions)
    return {"status": "Accepted", "message": "Full Sync Initiated (Forcing User Update)"}

@app.get("/health")
def health():
    return {"status": "up"}