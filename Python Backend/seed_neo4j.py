import pandas as pd
from neo4j import GraphDatabase
import time
from dotenv import load_dotenv
load_dotenv()
import os
password = os.getenv("password")

# --- CONFIGURATION ---
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", password)
class Neo4jSeeder:
    def __init__(self, uri, auth):
        self.driver = GraphDatabase.driver(uri, auth=auth)

    def close(self):
        self.driver.close()

    # 🛑 CRITICAL: Wipe DB before loading to prevent duplicate/corrupt graphs
    def clean_db(self):
        print("⚠️  Cleaning existing database...")
        with self.driver.session() as session:
            # Delete all nodes and relationships
            session.run("MATCH (n) DETACH DELETE n")
            
            # Create Indexes for speed (High Performance Engineering)
            session.run("CREATE INDEX IF NOT EXISTS FOR (u:User) ON (u.userId)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (u:User) ON (u.vpa)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (d:Device) ON (d.deviceId)")

    def load_users(self, csv_file):
        print(f"🔄 Loading Users from {csv_file}...")
        df = pd.read_csv(csv_file)
        df['kyc_status'] = df['kyc_status'].fillna('PENDING')
        df['risk_score'] = df['risk_score'].fillna(0.0)
        
        records = df.to_dict('records')
        query = """
        UNWIND $batch AS row
        MERGE (u:User {userId: toString(row.user_id)})
        SET u.phone = row.phone_number,
            u.name = row.full_name,
            u.kyc = row.kyc_status,
            u.riskScore = toFloat(row.risk_score),
            u.isFraud = toInteger(row.is_fraud), /* Ground Truth for Training */
            u.vpa = toString(row.phone_number) + '@upibank'
        """
        self._batch_execute(query, records, "Users")

    def load_devices(self, csv_file):
        print(f"🔄 Loading Devices from {csv_file}...")
        df = pd.read_csv(csv_file)
        records = df.to_dict('records')
        
        # This builds the 'Spider Web' topology
        query = """
        UNWIND $batch AS row
        MATCH (u:User {userId: toString(row.user_id)})
        
        MERGE (d:Device {deviceId: row.device_id})
        SET d.model = row.model_name
        
        MERGE (u)-[:USED_DEVICE {lastSeen: row.first_seen_at}]->(d)
        
        MERGE (i:IP {address: row.last_login_ip})
        MERGE (u)-[:HAS_IP]->(i)
        """
        self._batch_execute(query, records, "Devices")

    def load_transactions(self, csv_file):
        print(f"🔄 Loading Transactions from {csv_file}...")
        df = pd.read_csv(csv_file)
        records = df.to_dict('records')
        
        # This builds the 'Money Cycles'
        query = """
        UNWIND $batch AS row
        MATCH (sender:User {vpa: row.payer_vpa})
        MATCH (receiver:User {vpa: row.payee_vpa})
        
        MERGE (sender)-[r:SENT_MONEY {txnId: row.global_txn_id}]->(receiver)
        SET r.amount = toFloat(row.amount),
            r.ts = row.created_at,
            r.status = row.status,
            r.fraudLabel = toInteger(row.is_fraud_label)
        """
        self._batch_execute(query, records, "Transactions")

    def _batch_execute(self, query, data, label):
        total = len(data)
        start_time = time.time()
        with self.driver.session() as session:
            for i in range(0, total, BATCH_SIZE):
                batch = data[i : i + BATCH_SIZE]
                session.run(query, batch=batch)
                print(f"   Processed {min(i + BATCH_SIZE, total)} / {total} {label}", end='\r')
        print(f"\n   ✅ Finished {label} in {time.time() - start_time:.2f}s")

if __name__ == "__main__":
    seeder = Neo4jSeeder(NEO4J_URI, NEO4J_AUTH)
    try:
        seeder.clean_db()  # 1. Wipe old data
        seeder.load_users("users.csv")
        seeder.load_devices("user_devices.csv")
        seeder.load_transactions("transactions.csv")
        print("\n🎉 Graph Population Complete!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        seeder.close()