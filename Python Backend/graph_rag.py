import os
import logging
from neo4j import GraphDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("GraphRAG")

class ForensicGraphRAG:
    def __init__(self):
        # 1. Connect to Neo4j (The Knowledge)
        uri = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
        auth = ("neo4j", os.getenv("password", "password"))
        
        try:
            self.driver = GraphDatabase.driver(uri, auth=auth)
            # Test connection
            self.driver.verify_connectivity()
            logger.info("✅ Connected to Neo4j Graph Database")
        except Exception as e:
            logger.error(f"❌ Neo4j Connection Failed: {e}")
            self.driver = None

        # 2. Connect to Gemini (The Brain)
        api_key = os.getenv("GOOGLE_API_KEY")
        if api_key:
            # We use 'gemini-1.5-flash' for speed, or 'gemini-1.5-pro' for complex reasoning
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash", 
                temperature=0.0, 
                google_api_key=api_key
            )
            logger.info("✅ Connected to Google Gemini")
        else:
            self.llm = None
            logger.warning("⚠️ GOOGLE_API_KEY missing. GraphRAG disabled.")

    def fetch_ego_graph(self, vpa, hops=2):
        if not self.driver:
            return "Graph Database Unavailable."
            
        # 1. SANITIZE THE INPUT (Crucial Step)
        clean_vpa = vpa.strip() 
        logger.info(f"🔍 DEBUG: Searching for VPA: '{clean_vpa}' (Len: {len(clean_vpa)})")

        # 2. DEBUG QUERY: Check if the node exists at all (ignoring relationships)
        debug_check = "MATCH (u:User {userId: $vpa}) RETURN count(u) as count"
        
        try:
            with self.driver.session() as session:
                # Run the Debug Check First
                check_result = session.run(debug_check, vpa=clean_vpa).single()
                node_count = check_result["count"]
                logger.info(f"🔍 DEBUG: Node Count for '{clean_vpa}' = {node_count}")
                
                if node_count == 0:
                    return f"DEBUG INFO: User node '{clean_vpa}' does not exist in Neo4j."

                # If Node exists, run the full traversal
                query = f"""
                    MATCH (u:User {{userId: $vpa}})-[r:TRANSACTED_WITH*1..{hops}]-(n)
                    RETURN 
                        startNode(last(r)).userId AS source, 
                        endNode(last(r)).userId AS target, 
                        last(r).amount AS amount, 
                        last(r).ts AS timestamp, 
                        last(r).risk AS risk
                    ORDER BY last(r).ts DESC
                    LIMIT 20
                """
                
                result = session.run(query, vpa=clean_vpa)
                evidence_lines = []
                for record in result:
                    line = (f"{record['source']} paid {record['amount']} to {record['target']} "
                            f"at {record['timestamp']} (Risk: {record['risk']})")
                    evidence_lines.append(line)
                
                if not evidence_lines:
                    return f"DEBUG INFO: User '{clean_vpa}' exists, but has NO 'TRANSACTED_WITH' relationships."

                return "\n".join(evidence_lines)

        except Exception as e:
            logger.error(f"Graph Fetch Error: {e}")
            return "Error retrieving graph data."

    def analyze_case(self, txn_id, payer, payee, amount, reason):
        """
        Generates the Forensic SAR (Suspicious Activity Report) using Gemini.
        """
        if not self.llm:
            return "AI Analysis Unavailable (Check API Key)"

        # 1. Gather Evidence (RAG - Retrieval)
        graph_context = self.fetch_ego_graph(payer)

        # 2. Construct the Prompt (Augmentation)
        template = """
        You are a Senior Forensic Analyst at a Bank. A transaction was flagged as High Risk.
        Your job is to analyze the transaction history (Graph Context) and write a SAR (Suspicious Activity Report).

        === INCIDENT DETAILS ===
        Transaction ID: {txn_id}
        Payer: {payer}
        Payee: {payee}
        Amount: {amount}
        Flag Reason: {reason}

        === GRAPH EVIDENCE (Recent Network Activity) ===
        {context}

        === YOUR TASK ===
        Analyze the graph evidence above. Look for specific money laundering typologies:
        1. **Fan-Out:** One account sending money to many (Payroll/Mule Distributor).
        2. **Fan-In:** Many accounts sending money to one (Ponzi/Mule Aggregator).
        3. **Layering:** Money moving A -> B -> C rapidly.
        4. **Structuring:** Multiple small transactions just below reporting limits.

        === OUTPUT FORMAT ===
        **Verdict:** [Safe / Suspicious / Highly Illegal]
        **Pattern Detected:** [Name of typology or "None"]
        **Explanation:** [2 concise sentences explaining WHY based on the graph evidence]
        """

        prompt = PromptTemplate.from_template(template)
        chain = prompt | self.llm

        # 3. Generate Report (Generation)
        try:
            response = chain.invoke({
                "txn_id": txn_id,
                "payer": payer,
                "payee": payee,
                "amount": amount,
                "reason": reason,
                "context": graph_context
            })
            return response.content
        except Exception as e:
            logger.error(f"Gemini Generation Failed: {e}")
            return f"LLM Generation Failed: {e}"