import time
import psycopg2
import pandas as pd
from neo4j import GraphDatabase
import os
import logging
import redis
from dotenv import load_dotenv

load_dotenv()

# --- LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("graph_sync.log"), logging.StreamHandler()]
)

# --- CONFIGURATION ---
RDS_HOST = os.getenv("RDS_HOST")
RDS_PORT = int(os.getenv("RDS_PORT", 5432))
RDS_USER = os.getenv("RDS_USER")
RDS_PASSWORD = os.getenv("RDS_PASSWORD")
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", os.getenv("password"))
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

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
            logging.info("🔌 Connecting to PostgreSQL...")
            if not self.gateway_conn or self.gateway_conn.closed:
                self.gateway_conn = psycopg2.connect(
                    host=RDS_HOST, database="gateway_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            if not self.switch_conn or self.switch_conn.closed:
                self.switch_conn = psycopg2.connect(
                    host=RDS_HOST, database="switch_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            logging.info("✅ PostgreSQL Connected (Persistent).")
        except Exception as e:
            logging.error(f"❌ DB Init Failed: {e}")

    def ensure_conn(self):
        """Reconnects if connection is explicitly closed"""
        if self.gateway_conn is None or self.gateway_conn.closed:
            self.connect_postgres()
        if self.switch_conn is None or self.switch_conn.closed:
            self.connect_postgres()

    def load_state(self):
        try:
            state = {
                "last_user_time": self.redis_client.get("sync:last_user_time") or "2023-01-01 00:00:00",
                "last_device_time": self.redis_client.get("sync:last_device_time") or "2023-01-01 00:00:00",
                "last_txn_time": self.redis_client.get("sync:last_txn_time") or "2023-01-01 00:00:00"
            }
            return state
        except Exception:
            return {"last_user_time": "2023-01-01", "last_device_time": "2023-01-01", "last_txn_time": "2023-01-01"}

    def save_state(self):
        try:
            self.redis_client.set("sync:last_user_time", self.state['last_user_time'])
            self.redis_client.set("sync:last_device_time", self.state['last_device_time'])
            self.redis_client.set("sync:last_txn_time", self.state['last_txn_time'])
        except Exception:
            pass

    # --- SYNC METHODS ---

    def sync_users(self):
        try:
            self.ensure_conn()
            query = f"SELECT user_id, phone_number, kyc_status, risk_score, created_at FROM users WHERE created_at > '{self.state['last_user_time']}' ORDER BY created_at ASC LIMIT 1000"
            
            df = pd.read_sql(query, self.gateway_conn)
            
            if df.empty: return

            logging.info(f"🔄 Syncing {len(df)} New Users...")
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    session.run("""
                        MERGE (u:User {userId: toString($uid)})
                        SET u.phone = $phone, u.kyc = $kyc, u.riskScore = toFloat($risk), u.vpa = $phone + '@upibank'
                    """, uid=row['user_id'], phone=row['phone_number'], kyc=row['kyc_status'], risk=row['risk_score'])
            
            self.state['last_user_time'] = str(df.iloc[-1]['created_at'])
            self.save_state()

        except Exception as e:
            logging.error(f"❌ User Sync Error: {e}")
            # 🛡️ SELF HEALING: Force reconnect next time
            self.gateway_conn = None 

    def sync_devices(self):
        try:
            self.ensure_conn()
            query = f"SELECT user_id, device_id, last_login_ip, first_seen_at FROM user_devices WHERE first_seen_at > '{self.state['last_device_time']}' ORDER BY first_seen_at ASC LIMIT 1000"
            
            df = pd.read_sql(query, self.gateway_conn)
            
            if df.empty: return

            logging.info(f"🔄 Syncing {len(df)} New Devices...")
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    session.run("""
                        MATCH (u:User {userId: toString($uid)})
                        MERGE (d:Device {deviceId: $did})
                        MERGE (i:IP {address: $ip})
                        MERGE (u)-[:USED_DEVICE {lastSeen: $seen}]->(d)
                        MERGE (u)-[:HAS_IP]->(i)
                    """, uid=row['user_id'], did=row['device_id'], ip=row['last_login_ip'], seen=str(row['first_seen_at']))
            
            self.state['last_device_time'] = str(df.iloc[-1]['first_seen_at'])
            self.save_state()

        except Exception as e:
            logging.error(f"❌ Device Sync Error: {e}")
            self.gateway_conn = None # 🛡️ Reset connection

    def sync_transactions(self):
        try:
            self.ensure_conn()
            query = f"SELECT global_txn_id, payer_vpa, payee_vpa, amount, created_at FROM transactions WHERE created_at > '{self.state['last_txn_time']}' AND status = 'SUCCESS' ORDER BY created_at ASC LIMIT 1000"
            
            df = pd.read_sql(query, self.switch_conn)
            
            if df.empty: return

            logging.info(f"🔄 Syncing {len(df)} New Txns...")
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    session.run("""
                        MERGE (s:User {vpa: $payer})
                        MERGE (r:User {vpa: $payee})
                        MERGE (s)-[:SENT_MONEY {txnId: $tid, amount: toFloat($amt), ts: $ts}]->(r)
                    """, payer=row['payer_vpa'], payee=row['payee_vpa'], tid=row['global_txn_id'], amt=row['amount'], ts=str(row['created_at']))
            
            self.state['last_txn_time'] = str(df.iloc[-1]['created_at'])
            self.save_state()

        except Exception as e:
            logging.error(f"❌ Txn Sync Error: {e}")
            self.switch_conn = None # 🛡️ Reset connection

if __name__ == "__main__":
    service = GraphSyncService()
    logging.info("🚀 Optimized Poller Started")
    while True:
        service.sync_users()
        service.sync_devices()
        service.sync_transactions()
        time.sleep(2)