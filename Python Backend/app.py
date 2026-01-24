import os
import logging
import psycopg2
import pandas as pd
import redis
import json
from fastapi import FastAPI, BackgroundTasks, HTTPException
from neo4j import GraphDatabase
from dotenv import load_dotenv
from graph_rag import ForensicGraphRAG  # ✅ Import the new class
from pydantic import BaseModel

# Optional: Import LangChain for Forensic Investigator
# If not installed, the Investigator will simply be disabled.
try:
    from langchain_core.prompts import PromptTemplate
    from langchain_openai import ChatOpenAI
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False

load_dotenv()

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("GraphSyncAPI")

# 1. DB Credentials (Primary & Replica)
RDS_HOST = os.getenv("RDS_HOST", "localhost")       # Write Node
RDS_READ_HOST = os.getenv("RDS_READ_HOST", RDS_HOST) # Read Node (Fallback to Primary)
RDS_PORT = int(os.getenv("RDS_PORT", 5432))
RDS_USER = os.getenv("RDS_USER", "postgres")
RDS_PASSWORD = os.getenv("RDS_PASSWORD", "password")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_AUTH = ("neo4j", os.getenv("password", "password"))

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# AI Config (For Investigator)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

app = FastAPI(title="LedgerZero Graph Sync & Forensic Engine")

# --- 🕵️ FORENSIC INVESTIGATOR (GraphRAG) ---
class ForensicInvestigator:
    def __init__(self, driver):
        self.driver = driver
        if LANGCHAIN_AVAILABLE and OPENAI_API_KEY:
            self.llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.0, api_key=OPENAI_API_KEY)
        else:
            self.llm = None
            logger.warning("⚠️ Forensic Investigator disabled (Missing LangChain or API Key)")

    def fetch_crime_scene(self, user_vpa):
        """Retrieves 'Ego Graph' (User + 2 Hops) from Neo4j"""
        query = """
            MATCH (u:User {userId: $vpa})-[r:TRANSACTED_WITH*1..2]-(n)
            RETURN startNode(last(r)).userId as source, 
                   endNode(last(r)).userId as target, 
                   last(r).amount as amount, 
                   last(r).risk as risk,
                   last(r).ts as timestamp
            ORDER BY last(r).ts DESC LIMIT 15
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, vpa=user_vpa)
                lines = [f"{r['source']} -> {r['target']} | Amt: {r['amount']} | Risk: {r['risk']}" for r in result]
                return "\n".join(lines) if lines else "No recent graph activity found."
        except Exception as e:
            return f"Error fetching graph: {str(e)}"

    def generate_report(self, txn_id, payer, payee, reason):
        if not self.llm: return "Forensic Module Not Enabled."
        
        graph_context = self.fetch_crime_scene(payer)
        prompt = f"""
        You are an AI Forensic Analyst. A transaction was BLOCKED.
        
        === INCIDENT ===
        Txn ID: {txn_id} | Payer: {payer} | Payee: {payee} | Reason: {reason}
        
        === GRAPH EVIDENCE ===
        {graph_context}
        
        === TASK ===
        Analyze the graph for patterns (Mule Rings, Fan-In, Layering). 
        Write a concise 3-sentence Suspicious Activity Report (SAR).
        """
        try:
            return self.llm.invoke(prompt).content
        except Exception as e:
            return f"Generation Failed: {e}"

# --- 🔄 THE SYNC ENGINE CLASS ---
class GraphSyncService:
    def __init__(self):
        # 1. Neo4j & Redis
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)
        self.redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
        self.state = self.load_state()

        # 2. Connections (Split Read/Write)
        self.gateway_write_conn = None
        self.switch_write_conn = None
        self.gateway_read_conn = None
        self.switch_read_conn = None
        
        self.connect_postgres()

    def connect_postgres(self):
        """Establishes separate connections for Writes (Primary) and Reads (Replica)"""
        try:
            logger.info(f"🔌 Connecting to Primary ({RDS_HOST}) & Replica ({RDS_READ_HOST})...")
            
            # A. PRIMARY (For Updates/Feedback Loop)
            if not self.gateway_write_conn or self.gateway_write_conn.closed:
                self.gateway_write_conn = psycopg2.connect(
                    host=RDS_HOST, database="gateway_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            # Switch DB (Write) - kept for completeness
            if not self.switch_write_conn or self.switch_write_conn.closed:
                self.switch_write_conn = psycopg2.connect(
                    host=RDS_HOST, database="switch_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )

            # B. REPLICA (For Heavy Sync Reads)
            if not self.gateway_read_conn or self.gateway_read_conn.closed:
                self.gateway_read_conn = psycopg2.connect(
                    host=RDS_READ_HOST, database="gateway_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            if not self.switch_read_conn or self.switch_read_conn.closed:
                self.switch_read_conn = psycopg2.connect(
                    host=RDS_READ_HOST, database="switch_db", user=RDS_USER, password=RDS_PASSWORD, port=RDS_PORT
                )
            
            logger.info("✅ DB Connections Established (Split R/W).")
        except Exception as e:
            logger.error(f"❌ DB Init Failed: {e}")

    def ensure_conn(self):
        """Reconnects if any connection dropped"""
        if self.gateway_write_conn is None or self.gateway_write_conn.closed: self.connect_postgres()
        if self.switch_write_conn is None or self.switch_write_conn.closed: self.connect_postgres()
        if self.gateway_read_conn is None or self.gateway_read_conn.closed: self.connect_postgres()
        if self.switch_read_conn is None or self.switch_read_conn.closed: self.connect_postgres()

    def load_state(self):
        try:
            return {
                "last_user_time": self.redis_client.get("sync:last_user_time") or "2023-01-01 00:00:00",
                "last_txn_time": self.redis_client.get("sync:last_txn_time") or "2023-01-01 00:00:00"
            }
        except:
            return {"last_user_time": "2023-01-01", "last_txn_time": "2023-01-01"}

    def save_state(self, key, value):
        try:
            self.state[key] = str(value)
            self.redis_client.set(f"sync:{key}", str(value))
        except: pass

    # --- WORKER METHODS ---

    def sync_users(self, force=False):
        """Syncs users using READ REPLICA."""
        try:
            self.ensure_conn()
            
            if force:
                logger.info("⚠️ FORCING FULL USER SYNC...")
                query = "SELECT user_id, phone_number, kyc_status, risk_score, created_at FROM users ORDER BY created_at ASC LIMIT 1000"
            else:
                query = f"SELECT user_id, phone_number, kyc_status, risk_score, created_at FROM users WHERE created_at > '{self.state['last_user_time']}' ORDER BY created_at ASC LIMIT 1000"
            
            # 🚀 USE READ REPLICA
            df = pd.read_sql(query, self.gateway_read_conn)
            if df.empty: return

            logger.info(f"🔄 Syncing {len(df)} Users from Replica...")
            
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    phone_str = str(row['phone_number']).replace("+91", "").strip()
                    try: raw_risk = float(row['risk_score']) if not pd.isna(row['risk_score']) else 0.0
                    except: raw_risk = 0.0
                    
                    norm_risk = raw_risk / 100.0 
                    kyc_val = 1.0 if str(row['kyc_status']) == "VERIFIED" else 0.0
                    estimated_vpa = f"{phone_str}@okaxis"

                    # Update Neo4j
                    session.run("""
                        MERGE (u:User {userId: $vpa})
                        SET u.phone = $phone, u.kyc = $kyc, u.riskScore = $risk
                    """, vpa=estimated_vpa, phone=phone_str, kyc=kyc_val, risk=norm_risk)

                    # Update Redis
                    redis_key = f"user:{estimated_vpa}:features"
                    self.redis_client.set(redis_key, json.dumps([norm_risk, kyc_val]))
            
            if not force: self.save_state('last_user_time', df.iloc[-1]['created_at'])
            logger.info("✅ Users synced.")

        except Exception as e:
            logger.error(f"❌ User Sync Error: {e}")
            self.connect_postgres()

    def sync_transactions(self):
        """
        Syncs transactions using REPLICA.
        Updates User Risk using PRIMARY (Feedback Loop).
        """
        try:
            self.ensure_conn()
            query = f"""
                SELECT global_txn_id, payer_vpa, payee_vpa, amount, ml_fraud_score, created_at 
                FROM transactions 
                WHERE created_at > '{self.state['last_txn_time']}' 
                AND (status = 'SUCCESS' OR status = 'BLOCKED_FRAUD')
                ORDER BY created_at ASC LIMIT 1000
            """
            
            # 🚀 USE READ REPLICA
            df = pd.read_sql(query, self.switch_read_conn)
            if df.empty: return

            logger.info(f"🔄 Syncing {len(df)} Txns from Replica...")
            
            with self.driver.session() as session:
                for _, row in df.iterrows():
                    # 1. Neo4j Update
                    session.run("""
                        MERGE (s:User {userId: $payer})
                        MERGE (r:User {userId: $payee})
                        MERGE (s)-[:TRANSACTED_WITH {txnId: $tid, amount: toFloat($amt), ts: $ts, risk: toFloat($risk)}]->(r)
                    """, payer=row['payer_vpa'], payee=row['payee_vpa'], tid=row['global_txn_id'], amt=row['amount'], ts=str(row['created_at']), risk=row['ml_fraud_score'])
                    
                    # 2. FEEDBACK LOOP (Write to Primary)
                    try:
                        txn_risk = float(row['ml_fraud_score']) if row['ml_fraud_score'] else 0.0
                        if txn_risk > 0.50:
                            payer_vpa = str(row['payer_vpa'])
                            phone_extracted = payer_vpa.split('@')[0]
                            
                            logger.info(f"⚠️ High Risk ({txn_risk}) for {payer_vpa}. Updating DB...")

                            # 🚀 WRITE TO PRIMARY
                            update_sql = f"UPDATE users SET risk_score = GREATEST(risk_score, {txn_risk * 100}) WHERE phone_number LIKE '%{phone_extracted}'"
                            with self.gateway_write_conn.cursor() as cursor:
                                cursor.execute(update_sql)
                                self.gateway_write_conn.commit()

                            # Update Redis
                            redis_key = f"user:{payer_vpa}:features"
                            curr = self.redis_client.get(redis_key)
                            kyc = json.loads(curr)[1] if curr else 0.0
                            self.redis_client.set(redis_key, json.dumps([txn_risk, kyc]))

                    except Exception as e:
                        logger.error(f"Feedback Loop Error: {e}")

            self.save_state('last_txn_time', df.iloc[-1]['created_at'])
            logger.info("✅ Transactions synced.")

        except Exception as e:
            logger.error(f"❌ Txn Sync Error: {e}")
            self.connect_postgres()

# --- INITIALIZATION ---
sync_service = None
investigator = None

@app.on_event("startup")
def startup():
    global sync_service, investigator
    sync_service = GraphSyncService()
    if sync_service.driver:
        investigator = ForensicInvestigator(sync_service.driver)
    logger.info("✅ Graph Sync & Investigator Ready")

@app.on_event("shutdown")
def shutdown():
    if sync_service:
        if sync_service.driver: sync_service.driver.close()
        if sync_service.gateway_write_conn: sync_service.gateway_write_conn.close()
        if sync_service.switch_write_conn: sync_service.switch_write_conn.close()
        if sync_service.gateway_read_conn: sync_service.gateway_read_conn.close()
        if sync_service.switch_read_conn: sync_service.switch_read_conn.close()

# --- API ENDPOINTS ---

@app.post("/sync/users")
async def trigger_user_sync(background_tasks: BackgroundTasks):
    if sync_service: background_tasks.add_task(sync_service.sync_users)
    return {"status": "Queued"}

@app.post("/sync/transactions")
async def trigger_txn_sync(background_tasks: BackgroundTasks):
    if sync_service: background_tasks.add_task(sync_service.sync_transactions)
    return {"status": "Queued"}

@app.post("/sync/all")
async def trigger_full_sync(background_tasks: BackgroundTasks):
    if sync_service:
        background_tasks.add_task(sync_service.sync_users, force=True)
        background_tasks.add_task(sync_service.sync_transactions)
    return {"status": "Full Sync Initiated"}

@app.post("/investigate/fraud")
async def trigger_investigation(payload: dict, background_tasks: BackgroundTasks):
    """Payload: {"txnId": "...", "payer": "...", "payee": "...", "reason": "..."}"""
    if not investigator: return {"status": "Error", "message": "Investigator Disabled"}

    def _run_task():
        report = investigator.generate_report(payload['txnId'], payload['payer'], payload['payee'], payload['reason'])
        logger.info(f"\n📝 === FORENSIC REPORT ===\n{report}\n=========================")

    background_tasks.add_task(_run_task)
    return {"status": "Investigation Queued"}

@app.get("/health")
def health():
    return {"status": "up"}

# Initialize RAG Engine
rag_engine = ForensicGraphRAG()

# --- DATA MODELS ---
class InvestigationRequest(BaseModel):
    txnId: str
    payerVpa: str
    payeeVpa: str
    amount: float
    reason: str

# ... (Previous Sync Logic) ...

# --- NEW ENDPOINT ---
@app.post("/investigate/generate-report")
async def generate_forensic_report(req: InvestigationRequest):
    """
    Called by the Admin Dashboard or Switch when a user clicks "Investigate".
    Uses GraphRAG to explain the fraud.
    """
    logger.info(f"🕵️‍♂️ Starting Forensic Investigation for {req.txnId}")
    
    report = rag_engine.analyze_case(
        req.txnId, 
        req.payerVpa, 
        req.payeeVpa, 
        req.amount, 
        req.reason
    )
    
    return {
        "txnId": req.txnId,
        "status": "Completed",
        "forensic_report": report
    }