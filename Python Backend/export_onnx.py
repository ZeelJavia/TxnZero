import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
import redis
import json
import pandas as pd
from neo4j import GraphDatabase
import os
import io  # ✅ ADDED THIS IMPORT
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = ("neo4j", os.getenv("password", "password"))

# ==========================================
# 1. DEFINE MODEL ARCHITECTURE
# ==========================================
class FraudGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, hidden_channels)
        self.conv3 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        x = self.conv3(x, edge_index)
        return F.softmax(x, dim=1) 

# ==========================================
# 2. EXPORT TO ONNX (Forced Monolithic)
# ==========================================
def export_model():
    print("🔄 Loading V2 Model Weights...")
    model = FraudGNN(in_channels=2, hidden_channels=64, out_channels=2)
    
    try:
        # Update path to where your .pth file actually is
        model.load_state_dict(torch.load("models/fraud_gnn_model_neo4j_v2.pth"))
        print("✅ Weights loaded successfully.")
    except FileNotFoundError:
        print("❌ Error: .pth file not found.")
        return

    model.eval() 

    # Dummy Inputs
    dummy_x = torch.randn(1, 2)  
    dummy_edge_index = torch.tensor([[0], [0]], dtype=torch.long) 

    print("🔄 Converting to ONNX (Forcing Single File)...")
    
    # ---------------------------------------------------------
    # ✅ THE FIX: Export to Memory (BytesIO) instead of Disk
    # This prevents PyTorch from creating a separate .data file
    # ---------------------------------------------------------
    buffer = io.BytesIO()

    torch.onnx.export(
        model, 
        (dummy_x, dummy_edge_index), 
        buffer,  # <--- Write to RAM, not Disk
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
    
    # Now write the RAM buffer to a single file on disk
    buffer.seek(0)
    with open("fraud_model_v2.onnx", "wb") as f:
        f.write(buffer.read())

    print("✅ Success! Exported SINGLE file to 'fraud_model_v2.onnx'")

# ==========================================
# 3. PUSH FEATURES TO REDIS
# ==========================================
def push_features_to_redis():
    # ... (Keep your existing Redis code here, it was correct) ...
    print(" (Skipping Redis code for brevity, assumes it works) ")

if __name__ == "__main__":
    export_model()
    # push_features_to_redis()