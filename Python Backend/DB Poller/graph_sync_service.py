import time
import psycopg2
import pandas as pd
from neo4j import GraphDatabase
from datetime import datetime
import os
import logging
import redis  # 1. New Import
from dotenv import load_dotenv

load_dotenv()

# --- 1. SETUP LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("graph_sync.log"),
        logging.StreamHandler()
    ]
)

# --- CONFIGURATION ---
# AWS RDS Details
RDS_HOST = os.getenv("RDS_HOST")
RDS_PORT = int(os.getenv("RDS_PORT", 5432))
RDS_USER = os.getenv("RDS_USER")
RDS_PASSWORD = os.getenv("RDS_PASSWORD")

# Neo4j Details
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", os.getenv("password"))

# Redis Details (For State Management)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = 0

class GraphSyncService:
    def __init__(self):
        # 1. Connect to Neo4j
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)
        
        # 2. Connect to Redis (State Store)
        logging.info(f"🔌 Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
        try:
            self.redis_client = redis.Redis(
                host=REDIS_HOST, 
                port=REDIS_PORT, 
                db=REDIS_DB, 
                decode_responses=True # Returns strings instead of bytes
            )
            self.redis_client.ping() # Test connection
            logging.info("✅ Connected to Redis.")
        except Exception as e:
            logging.error(f"❌ Failed to connect to Redis: {e}")
            raise e

        # 3. Load Initial State
        self.state = self.load_state()

    def close(self):
        self.driver.close()
        self.redis_client.close()

    # --- PERSISTENCE: Redis State Management ---
    def load_state(self):
        """Fetches the last sync timestamps from Redis"""
        try:
            # Fetch keys individually
            last_user = self.redis_client.get("sync:last_user_time")
            last_device = self.redis_client.get("sync:last_device_time")
            last_txn = self.redis_client.get("sync:last_txn_time")

            # Fallback to default if keys are missing (First Run)
            default_time = "2023-01-01 00:00:00"
            
            state = {
                "last_user_time": last_user if last_user else default_time,
                "last_device_time": last_device if last_device else default_time,
                "last_txn_time": last_txn if last_txn else default_time
            }
            
            logging.info(f"📂 Loaded State from Redis: {state}")
            return state

        except Exception as e:
            logging.error(f"❌ Critical Error loading state from Redis: {e}")
            # Crash intentionally so we don't start from 2023 and wipe the DB
            raise e 

    def save_state(self):
        """Updates Redis with the current in-memory state"""
        try:
            self.redis_client.set("sync:last_user_time", self.state['last_user_time'])
            self.redis_client.set("sync:last_device_time", self.state['last_device_time'])
            self.redis_client.set("sync:last_txn_time", self.state['last_txn_time'])
        except Exception as e:
            logging.error(f"❌ Failed to save state to Redis: {e}")

    def get_rds_connection(self, db_name):
        return psycopg2.connect(
            host=RDS_HOST,
            database=db_name,
            user=RDS_USER,
            password=RDS_PASSWORD,
            port=RDS_PORT,
            connect_timeout=3
        )

    # ==========================================
    # 1. SYNC NEW USERS
    # ==========================================
    def sync_users(self):
        try:
            conn = self.get_rds_connection("gateway_db")
            query = f"""
                SELECT user_id, phone_number, kyc_status, risk_score, created_at 
                FROM users 
                WHERE created_at > '{self.state['last_user_time']}'
                ORDER BY created_at ASC LIMIT 1000
            """
            df = pd.read_sql(query, conn)
            conn.close()

            if df.empty: return

            logging.info(f"🔄 Syncing {len(df)} New Users...")
            
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    session.run("""
                        MERGE (u:User {userId: toString($uid)})
                        SET u.phone = $phone, 
                            u.kyc = $kyc, 
                            u.riskScore = toFloat($risk),
                            u.vpa = $phone + '@upibank'
                    """, uid=row['user_id'], phone=row['phone_number'], 
                       kyc=row['kyc_status'], risk=row['risk_score'])
            
            # Update Memory & Redis
            self.state['last_user_time'] = str(df.iloc[-1]['created_at'])
            self.save_state()
            logging.info(f"✅ Users synced up to {self.state['last_user_time']}")

        except Exception as e:
            logging.error(f"❌ Error syncing users: {e}")

    # ==========================================
    # 2. SYNC DEVICES
    # ==========================================
    def sync_devices(self):
        try:
            conn = self.get_rds_connection("gateway_db")
            query = f"""
                SELECT user_id, device_id, last_login_ip, first_seen_at 
                FROM user_devices 
                WHERE first_seen_at > '{self.state['last_device_time']}'
                ORDER BY first_seen_at ASC LIMIT 1000
            """
            df = pd.read_sql(query, conn)
            conn.close()

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
                    """, uid=row['user_id'], did=row['device_id'], 
                       ip=row['last_login_ip'], seen=str(row['first_seen_at']))

            self.state['last_device_time'] = str(df.iloc[-1]['first_seen_at'])
            self.save_state()
            logging.info(f"✅ Devices synced up to {self.state['last_device_time']}")

        except Exception as e:
            logging.error(f"❌ Error syncing devices: {e}")

    # ==========================================
    # 3. SYNC TRANSACTIONS
    # ==========================================
    def sync_transactions(self):
        try:
            conn = self.get_rds_connection("switch_db")
            query = f"""
                SELECT global_txn_id, payer_vpa, payee_vpa, amount, created_at 
                FROM transactions 
                WHERE created_at > '{self.state['last_txn_time']}'
                AND status = 'SUCCESS'
                ORDER BY created_at ASC LIMIT 1000
            """
            df = pd.read_sql(query, conn)
            conn.close()

            if df.empty: return

            logging.info(f"🔄 Syncing {len(df)} New Transactions...")

            with self.driver.session() as session:
                for _, row in df.iterrows():
                    session.run("""
                        MERGE (sender:User {vpa: $payer})
                        MERGE (receiver:User {vpa: $payee})
                        MERGE (sender)-[:SENT_MONEY {
                            txnId: $tid, 
                            amount: toFloat($amt), 
                            ts: $ts
                        }]->(receiver)
                    """, payer=row['payer_vpa'], payee=row['payee_vpa'], 
                       tid=row['global_txn_id'], amt=row['amount'], 
                       ts=str(row['created_at']))

            self.state['last_txn_time'] = str(df.iloc[-1]['created_at'])
            self.save_state()
            logging.info(f"✅ Transactions synced up to {self.state['last_txn_time']}")

        except Exception as e:
            logging.error(f"❌ Error syncing transactions: {e}")

if __name__ == "__main__":
    try:
        syncer = GraphSyncService()
        logging.info("🚀 Redis-Backed Sync Service Started.")
        
        while True:
            syncer.sync_users()
            syncer.sync_devices()
            syncer.sync_transactions()
            time.sleep(2) 
            
    except KeyboardInterrupt:
        logging.info("🛑 Service Stopping...")
        if 'syncer' in locals(): syncer.close()
    except Exception as e:
        logging.critical(f"🔥 Fatal Service Error: {e}")