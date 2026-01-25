import torch
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import pandas as pd
import numpy as np
import os

print("🚀 Starting GNN Training Pipeline (Source: CSV)...")

# ==========================================
# 1. LOAD DATA FROM CSV
# ==========================================
def load_csv_data(folder_path="train_test_data"):
    print(f"   Loading CSVs from '{folder_path}'...")
    
    # 🚨 UPDATE THESE FILENAMES TO MATCH YOURS
    users_path = os.path.join(folder_path, "users.csv")
    txns_path = os.path.join(folder_path, "transactions.csv")
    
    if not os.path.exists(users_path) or not os.path.exists(txns_path):
        print(f"❌ ERROR: Could not find files in {folder_path}")
        print(f"   Looking for: {users_path} and {txns_path}")
        exit()

    # Load Nodes (Users)
    # Expected columns in CSV: user_id, kyc_status, risk_score, is_fraud
    nodes_df = pd.read_csv(users_path)
    
    # Load Edges (Transactions)
    # Expected columns in CSV: source, target, amount
    edges_df = pd.read_csv(txns_path)
    
    # --- COLUMN MAPPING (Safety Check) ---
    # Rename columns to match what the script expects if they are different
    # Example: if CSV has 'id', rename to 'user_id'
    nodes_df.rename(columns={
        'userId': 'user_id', 
        'id': 'user_id',
        'kyc': 'kyc_status',
        'risk': 'risk_score',
        'isFraud': 'label'
    }, inplace=True)

    edges_df.rename(columns={
        'from': 'source',
        'payer': 'source',
        'to': 'target',
        'payee': 'target'
    }, inplace=True)

    return nodes_df, edges_df

nodes_df, edges_df = load_csv_data()

print(f"   Loaded {len(nodes_df)} Nodes and {len(edges_df)} Edges.")

# ==========================================
# 2. PREPROCESS DATA
# ==========================================

# --- A. NODE FEATURES ---
# 1. Handle Missing Data
nodes_df['risk_score'] = nodes_df['risk_score'].fillna(0.0)
nodes_df['kyc_status'] = nodes_df['kyc_status'].fillna('PENDING')
nodes_df['label'] = nodes_df['label'].fillna(0).astype(int)

# 2. Encode KYC
le = LabelEncoder()
nodes_df['kyc_encoded'] = le.fit_transform(nodes_df['kyc_status'].astype(str))

# 3. Normalize Features
scaler = StandardScaler()
node_features = scaler.fit_transform(nodes_df[['risk_score', 'kyc_encoded']])

x = torch.tensor(node_features, dtype=torch.float)
y = torch.tensor(nodes_df['label'].values, dtype=torch.long)

# --- B. EDGE INDEX ---
# Create mapping: User ID (String) -> Index (Int)
uuid_to_idx = {str(uuid): idx for idx, uuid in enumerate(nodes_df['user_id'])}

valid_edges = []
for _, row in edges_df.iterrows():
    src = str(row['source'])
    dst = str(row['target'])
    
    if src in uuid_to_idx and dst in uuid_to_idx:
        src_idx = uuid_to_idx[src]
        dst_idx = uuid_to_idx[dst]
        valid_edges.append([src_idx, dst_idx])

if not valid_edges:
    print("❌ CRITICAL: No valid edges found. Check if User IDs in 'transactions.csv' match 'users.csv'.")
    exit()

edge_index = torch.tensor(valid_edges, dtype=torch.long).t().contiguous()

print(f"   Graph Constructed. Input Features: {x.shape[1]}")

# ==========================================
# 3. SPLIT DATA
# ==========================================
indices = range(len(nodes_df))
# Handle case where dataset is too small for split
if len(nodes_df) > 10:
    train_idx, test_idx = train_test_split(indices, test_size=0.2, stratify=y, random_state=42)
else:
    train_idx, test_idx = indices, indices # Overfit mode for tiny debug data

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
    # Weight formula: Total / (Classes * Count)
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
        
        # Calculate Recall on Test Set
        fraud_mask_test = test_mask & (y == 1)
        total_fraud = fraud_mask_test.sum().item()
        
        if total_fraud > 0:
            correct_fraud = (pred[fraud_mask_test] == y[fraud_mask_test]).sum().item()
            recall = correct_fraud / total_fraud
        else:
            recall = 0.0
            
        print(f'Epoch {epoch:03d}: Loss: {loss:.4f}, Fraud Recall: {recall:.4f}')

# ==========================================
# 6. EXPORT
# ==========================================
print("\n💾 Saving Model...")
torch.save(model.state_dict(), "fraud_gnn_model_csv.pth")

# ==========================================
# 7. EVALUATION REPORT
# ==========================================
print("\n📊 --- FINAL MODEL EVALUATION ---")
model.eval()
with torch.no_grad():
    out = model(x, edge_index)
    probs = torch.exp(out)[test_mask][:, 1].cpu().numpy()
    preds = out.argmax(dim=1)[test_mask].cpu().numpy()
    y_true = y[test_mask].cpu().numpy()

# Avoid crash if only 1 class in test set
if len(np.unique(y_true)) > 1:
    print(classification_report(y_true, preds, target_names=['Legit', 'Fraud']))
    try:
        auc = roc_auc_score(y_true, probs)
        print(f"⭐ AUC-ROC Score: {auc:.4f}")
    except: pass
    
    cm = confusion_matrix(y_true, preds)
    print("\nConfusion Matrix:")
    print(cm)
else:
    print("⚠️ Test set contains only one class. Cannot calculate AUC/Confusion Matrix.")