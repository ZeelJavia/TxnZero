import torch
import torch.nn.functional as F
from neo4j import GraphDatabase
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from torch_geometric.utils import to_undirected
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import os

# --- CONFIGURATION ---
load_dotenv()
password = os.getenv("password")
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", password)

print("🚀 Starting IMPROVED GNN Training (Money + Device Topology)...")

class GraphDatasetLoader:
    def __init__(self, uri, auth):
        self.driver = GraphDatabase.driver(uri, auth=auth)

    def close(self):
        self.driver.close()

    def fetch_graph_data(self):
        print("   Connecting to Neo4j...")
        with self.driver.session() as session:
            # 1. FETCH NODES (Users)
            print("   Fetching Nodes...")
            query_nodes = """
            MATCH (u:User)
            RETURN u.userId as user_id, 
                   u.kyc as kyc_status, 
                   u.riskScore as risk_score, 
                   u.isFraud as label
            """
            nodes_result = session.run(query_nodes)
            data = [r.data() for r in nodes_result]
            
            # 🚨 SAFETY CHECK 🚨
            if not data:
                return pd.DataFrame(), pd.DataFrame()

            nodes_df = pd.DataFrame(data)

            # 2. FETCH MONEY EDGES (Transaction Topology)
            print("   Fetching Transaction Edges...")
            query_edges = """
            MATCH (u1:User)-[r:SENT_MONEY]->(u2:User)
            RETURN u1.userId as source, 
                   u2.userId as target
            """
            edges_result = session.run(query_edges)
            txns_df = pd.DataFrame([r.data() for r in edges_result])

            # 3. FETCH SHARED DEVICE EDGES (Virtual Topology)
            # Logic: If User A and User B used the same device, link them!
            print("   Fetching Shared Device Edges (The 'Spider Web')...")
            query_devices = """
            MATCH (u1:User)-[:USED_DEVICE]->(d:Device)<-[:USED_DEVICE]-(u2:User)
            WHERE u1.userId < u2.userId  // Prevent duplicates (A-B and B-A)
            RETURN u1.userId as source, u2.userId as target
            """
            devices_result = session.run(query_devices)
            devices_df = pd.DataFrame([r.data() for r in devices_result])

            # 4. MERGE THE GRAPHS
            print(f"   -> Found {len(txns_df)} Txn Links and {len(devices_df)} Device Links")
            
            # Combine both dataframes safely
            frames = []
            if not txns_df.empty: frames.append(txns_df)
            if not devices_df.empty: frames.append(devices_df)
            
            if frames:
                full_edges_df = pd.concat(frames, ignore_index=True)
            else:
                full_edges_df = pd.DataFrame(columns=['source', 'target'])
            
            return nodes_df, full_edges_df

# ==========================================
# 1. LOAD DATA FROM NEO4J
# ==========================================
loader = GraphDatasetLoader(NEO4J_URI, NEO4J_AUTH)
nodes_df, edges_df = loader.fetch_graph_data()
loader.close()

# 🚨 CRITICAL CHECK 🚨
if nodes_df.empty:
    print("\n❌ STOPPING: No data found in Neo4j.")
    print("   Please run the Sync Service (POST /sync/all) to populate the graph.")
    exit()

print(f"   Loaded {len(nodes_df)} Nodes and {len(edges_df)} Total Edges.")

# ==========================================
# 2. PREPROCESS DATA
# ==========================================

# --- A. NODE FEATURES ---
nodes_df['risk_score'] = nodes_df['risk_score'].fillna(0.0)
nodes_df['kyc_status'] = nodes_df['kyc_status'].fillna('PENDING')
nodes_df['label'] = nodes_df['label'].fillna(0).astype(int)

le = LabelEncoder()
nodes_df['kyc_encoded'] = le.fit_transform(nodes_df['kyc_status'].astype(str))

scaler = StandardScaler()
node_features = scaler.fit_transform(nodes_df[['risk_score', 'kyc_encoded']])

x = torch.tensor(node_features, dtype=torch.float)
y = torch.tensor(nodes_df['label'].values, dtype=torch.long)

# --- B. EDGE INDEX ---
# Map User IDs (Strings) to Indices (0, 1, 2...)
uuid_to_idx = {uuid: idx for idx, uuid in enumerate(nodes_df['user_id'])}

valid_edges = []
if not edges_df.empty:
    for _, row in edges_df.iterrows():
        if row['source'] in uuid_to_idx and row['target'] in uuid_to_idx:
            src_idx = uuid_to_idx[row['source']]
            dst_idx = uuid_to_idx[row['target']]
            valid_edges.append([src_idx, dst_idx])

if not valid_edges:
    print("⚠️ WARNING: No valid edges connected known users. Graph will be disconnected.")
    edge_index = torch.empty((2, 0), dtype=torch.long)
else:
    edge_index = torch.tensor(valid_edges, dtype=torch.long).t().contiguous()

# 🚀 IMPROVEMENT: Make graph undirected (bidirectional information flow)
edge_index = to_undirected(edge_index)

print(f"   Graph Constructed. Input Features: {x.shape[1]}")

# ==========================================
# 3. SPLIT DATA
# ==========================================
indices = range(len(nodes_df))

# Handle small datasets gracefully
if len(nodes_df) > 5:
    train_idx, test_idx = train_test_split(indices, test_size=0.2, stratify=y, random_state=42)
else:
    train_idx, test_idx = indices, indices

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
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        
        x = self.conv3(x, edge_index)
        return F.log_softmax(x, dim=1)

model = FraudGNN(in_channels=x.shape[1], hidden_channels=64, out_channels=2)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

# Handle Class Imbalance
fraud_count = y.sum().item()
if fraud_count > 0:
    weight_val = (len(y) - fraud_count) / fraud_count
    weight = torch.tensor([1.0, weight_val], dtype=torch.float)
    print(f"   Class Weight Applied: {weight_val:.2f} (Fraud is rare)")
else:
    weight = torch.tensor([1.0, 1.0])

criterion = torch.nn.NLLLoss(weight=weight)

# ==========================================
# 5. TRAINING LOOP
# ==========================================
print("\n🔄 Training Started...")
best_recall = 0.0

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
        
        fraud_mask_test = test_mask & (y == 1)
        total_fraud = fraud_mask_test.sum().item()
        
        if total_fraud > 0:
            correct_fraud = (pred[fraud_mask_test] == y[fraud_mask_test]).sum().item()
            recall = correct_fraud / total_fraud
        else:
            recall = 0.0
        
        if recall > best_recall: best_recall = recall
        print(f'Epoch {epoch:03d}: Loss: {loss:.4f}, Fraud Recall: {recall:.4f}')

print(f"\n✅ Best Recall Achieved: {best_recall:.4f}")

# ==========================================
# 6. EXPORT
# ==========================================
print("\n💾 Saving Model...")
torch.save(model.state_dict(), "fraud_gnn_model_neo4j_v2.pth")
print("✅ Model Trained & Saved!")

# ==========================================
# 7. EVALUATION REPORT (UPDATED)
# ==========================================
print("\n📊 --- FINAL MODEL EVALUATION ---")
model.eval()

# 1. Get Predictions on Test Set
with torch.no_grad():
    out = model(x, edge_index)
    # Get probabilities for class 1 (Fraud)
    probs = torch.exp(out)[test_mask][:, 1].cpu().numpy()
    # Get predicted class (0 or 1)
    preds = out.argmax(dim=1)[test_mask].cpu().numpy()
    # Get actual labels
    y_true = y[test_mask].cpu().numpy()

# Only run report if we have classes in test set
if len(np.unique(y_true)) > 1:
    # 2. Print Classification Report (Precision, Recall, F1)
    print("\nClassification Report:")
    print(classification_report(y_true, preds, target_names=['Legit', 'Fraud']))

    # 3. Calculate AUC-ROC
    try:
        auc = roc_auc_score(y_true, probs)
        print(f"⭐ AUC-ROC Score: {auc:.4f}")
        if auc > 0.9: print("   Interpretation: Excellent discrimination.")
        elif auc > 0.8: print("   Interpretation: Good discrimination.")
        else: print("   Interpretation: Needs improvement.")
    except ValueError:
        print("⚠️ AUC-ROC skipped (Only one class present in test set)")

    # 4. Generate Confusion Matrix
    conf_matrix = confusion_matrix(y_true, preds)
    print("\nConfusion Matrix:")
    print(f"True Negatives (Legit Correct): {conf_matrix[0][0]}")
    print(f"False Positives (Legit -> Fraud): {conf_matrix[0][1]} (User Friction)")
    print(f"False Negatives (Fraud -> Legit): {conf_matrix[1][0]} (Missed Fraud)")
    print(f"True Positives (Fraud Correct): {conf_matrix[1][1]}")

else:
    print("⚠️ Test set contains only one class. Cannot calculate AUC/Confusion Matrix.")