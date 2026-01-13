import torch
import torch.nn.functional as F
from neo4j import GraphDatabase
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import pandas as pd
import numpy as np
from dotenv import load_dotenv
load_dotenv()
import os
password = os.getenv("password")

# --- CONFIGURATION ---
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", password)

print("🚀 Starting GNN Training Pipeline (Source: Neo4j)...")

class GraphDatasetLoader:
    def __init__(self, uri, auth):
        self.driver = GraphDatabase.driver(uri, auth=auth)

    def close(self):
        self.driver.close()

    def fetch_graph_data(self):
        print("   Connecting to Neo4j...")
        with self.driver.session() as session:
            # 1. FETCH NODES (Users)
            # We fetch features: KYC, Risk Score, and the Label (isFraud)
            # Note: In the sync script, we stored these properties on the User node.
            # You might need to adjust property names if they differ in your DB.
            print("   Fetching Nodes...")
            query_nodes = """
            MATCH (u:User)
            RETURN u.userId as user_id, 
                   u.kyc as kyc_status, 
                   u.riskScore as risk_score, 
                   u.isFraud as label
            """
            nodes_result = session.run(query_nodes)
            nodes_df = pd.DataFrame([r.data() for r in nodes_result])

            # 2. FETCH EDGES (Transactions)
            print("   Fetching Edges...")
            query_edges = """
            MATCH (u1:User)-[r:SENT_MONEY]->(u2:User)
            RETURN u1.userId as source, 
                   u2.userId as target, 
                   r.amount as amount
            """
            edges_result = session.run(query_edges)
            edges_df = pd.DataFrame([r.data() for r in edges_result])
            
            return nodes_df, edges_df

# ==========================================
# 1. LOAD DATA FROM NEO4J
# ==========================================
loader = GraphDatasetLoader(NEO4J_URI, NEO4J_AUTH)
nodes_df, edges_df = loader.fetch_graph_data()
loader.close()

print(f"   Loaded {len(nodes_df)} Nodes and {len(edges_df)} Edges.")

# ==========================================
# 2. PREPROCESS DATA (Pandas -> PyTorch)
# ==========================================

# --- A. NODE FEATURES ---
# 1. Handle Missing Data (Safe Defaults)
nodes_df['risk_score'] = nodes_df['risk_score'].fillna(0.0)
nodes_df['kyc_status'] = nodes_df['kyc_status'].fillna('PENDING')
nodes_df['label'] = nodes_df['label'].fillna(0).astype(int)

# 2. Encode KYC (Pending=0, Verified=1)
le = LabelEncoder()
nodes_df['kyc_encoded'] = le.fit_transform(nodes_df['kyc_status'])

# 3. Normalize Features
scaler = StandardScaler()
# We use Risk Score (normalized) and KYC status as features
# In a real system, you'd add 'Account Age', 'Avg Transaction Amount', etc.
node_features = scaler.fit_transform(nodes_df[['risk_score', 'kyc_encoded']])

x = torch.tensor(node_features, dtype=torch.float)
y = torch.tensor(nodes_df['label'].values, dtype=torch.long)

# --- B. EDGE INDEX ---
# Neo4j uses UUID strings, PyTorch needs Indices (0, 1, 2...)
# Create a mapping: UUID -> Index
uuid_to_idx = {uuid: idx for idx, uuid in enumerate(nodes_df['user_id'])}

# Convert Source/Target UUIDs to Indices
# Filter out edges where nodes might be missing (data sync lag)
valid_edges = []
for _, row in edges_df.iterrows():
    if row['source'] in uuid_to_idx and row['target'] in uuid_to_idx:
        src_idx = uuid_to_idx[row['source']]
        dst_idx = uuid_to_idx[row['target']]
        valid_edges.append([src_idx, dst_idx])

edge_index = torch.tensor(valid_edges, dtype=torch.long).t().contiguous()

print(f"   Graph Constructed. Input Features: {x.shape[1]}")

# ==========================================
# 3. SPLIT DATA
# ==========================================
# Stratified Split (80% Train, 20% Test)
indices = range(len(nodes_df))
train_idx, test_idx = train_test_split(indices, test_size=0.2, stratify=y)

train_mask = torch.zeros(len(nodes_df), dtype=torch.bool)
test_mask = torch.zeros(len(nodes_df), dtype=torch.bool)
train_mask[train_idx] = True
test_mask[test_idx] = True

# ==========================================
# 4. DEFINE MODEL (GraphSAGE)
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
        x = F.dropout(x, p=0.3, training=self.training)
        # Layer 2
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        # Layer 3 (Output)
        x = self.conv3(x, edge_index)
        return F.log_softmax(x, dim=1)

model = FraudGNN(in_channels=x.shape[1], hidden_channels=64, out_channels=2)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

# Handle Class Imbalance
fraud_count = y.sum().item()
if fraud_count > 0:
    weight = torch.tensor([1.0, (len(y) - fraud_count) / fraud_count], dtype=torch.float)
else:
    weight = torch.tensor([1.0, 1.0]) # Fallback if no fraud in sample
    
criterion = torch.nn.NLLLoss(weight=weight)

# ==========================================
# 5. TRAINING LOOP
# ==========================================
print("\n🔄 Training Started...")

for epoch in range(201):
    model.train()
    optimizer.zero_grad()
    
    out = model(x, edge_index)
    loss = criterion(out[train_mask], y[train_mask])
    
    loss.backward()
    optimizer.step()

    if epoch % 20 == 0:
        model.eval()
        pred = out.argmax(dim=1)
        
        # Recall Calculation
        fraud_mask_test = test_mask & (y == 1)
        correct_fraud = (pred[fraud_mask_test] == y[fraud_mask_test]).sum()
        total_fraud = fraud_mask_test.sum()
        
        recall = int(correct_fraud) / int(total_fraud) if total_fraud > 0 else 0.0
        print(f'Epoch {epoch:03d}: Loss: {loss:.4f}, Fraud Recall: {recall:.4f}')

# ==========================================
# 6. EXPORT
# ==========================================
print("\n💾 Saving Model...")
torch.save(model.state_dict(), "fraud_gnn_model_neo4j.pth")

# Optional: Export mappings for Inference
import json
with open("uuid_map.json", "w") as f:
    # Save a sample of the map or specific logic if needed for inference
    f.write(json.dumps({"info": "Mapping logic relies on Neo4j Graph ID or external User ID"}))

print("✅ Model Trained on Neo4j Data!")