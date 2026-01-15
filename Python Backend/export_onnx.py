import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
import redis
import json
import pandas as pd
from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", os.getenv("password"))

# ==========================================
# 1. DEFINE MODEL ARCHITECTURE (Inference Mode)
# ==========================================
class FraudGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, hidden_channels)
        self.conv3 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        # Layer 1
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        # Note: No Dropout needed for Inference/Export
        
        # Layer 2
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        
        # Layer 3
        x = self.conv3(x, edge_index)
        
        # 🚨 CRITICAL FIX: Use softmax, NOT log_softmax
        # This ensures output is 0.0 to 1.0 (Probability)
        return F.softmax(x, dim=1) 

# ==========================================
# 2. EXPORT TO ONNX
# ==========================================
def export_model():
    print("🔄 Loading V2 Model Weights...")
    model = FraudGNN(in_channels=2, hidden_channels=64, out_channels=2)
    
    try:
        # Load the weights trained with log_softmax (it's compatible!)
        model.load_state_dict(torch.load("fraud_gnn_model_neo4j_v2.pth"))
        print("✅ Weights loaded successfully.")
    except FileNotFoundError:
        print("❌ Error: 'fraud_gnn_model_neo4j_v2.pth' not found.")
        return

    model.eval() 

    # Dummy Input for Tracing (1 Node, 2 Features)
    dummy_x = torch.randn(1, 2)  
    # Dummy Edge (Self-loop)
    dummy_edge_index = torch.tensor([[0], [0]], dtype=torch.long) 

    print("🔄 Converting to ONNX...")
    
    # 
    
    torch.onnx.export(
        model, 
        (dummy_x, dummy_edge_index), 
        "fraud_model_v2.onnx", 
        export_params=True,
        opset_version=16, 
        do_constant_folding=True,
        input_names = ['x', 'edge_index'],
        output_names = ['output'],
        dynamic_axes={
            'x': {0: 'num_nodes'},          
            'edge_index': {1: 'num_edges'}  
        }
    )
    print("✅ Success! Exported to 'fraud_model_v2.onnx' (Probability Output)")

# ==========================================
# 3. PUSH FEATURES TO REDIS (Feature Store)
# ==========================================
def push_features_to_redis():
    print("\n⚡ Connecting to Neo4j to fetch latest Node Features...")
    driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)
    
    query = """
    MATCH (u:User)
    RETURN u.userId as user_id, u.riskScore as risk_score, u.kyc as kyc_status
    """
    
    with driver.session() as session:
        result = session.run(query)
        df = pd.DataFrame([r.data() for r in result])
    
    driver.close()
    
    if df.empty:
        print("⚠️ No users found in Neo4j. Skipping Redis push.")
        return

    print(f"   Fetched {len(df)} Users. Connecting to Redis...")
    
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
    pipe = r.pipeline()
    
    count = 0
    # Manual encoding to match training logic
    for _, row in df.iterrows():
        kyc_val = 1.0 if row['kyc_status'] == 'VERIFIED' else 0.0
        risk_val = float(row['risk_score']) if row['risk_score'] is not None else 0.0
        
        # Key: "user:{ID}:features"
        redis_key = f"user:{row['user_id']}:features"
        # Value: [risk_score, kyc_encoded]
        redis_val = json.dumps([risk_val, kyc_val])
        
        pipe.set(redis_key, redis_val)
        count += 1
        
        if count % 1000 == 0:
            pipe.execute()
            print(f"   Pushed {count} users...", end='\r')
            
    pipe.execute()
    print(f"\n✅ Successfully pushed {count} Feature Vectors to Redis!")

if __name__ == "__main__":
    export_model()
    push_features_to_redis()