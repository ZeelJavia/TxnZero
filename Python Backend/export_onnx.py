import torch
from train_gnn_neo4j import FraudGNN # Import your model class

# 1. Initialize Model
model = FraudGNN(in_channels=2, hidden_channels=64, out_channels=2)
model.load_state_dict(torch.load("fraud_gnn_model_neo4j.pth"))
model.eval()

# 2. Create Dummy Input (1 Node, 2 Features) for tracing
# We need to tell ONNX what the data looks like.
dummy_x = torch.randn(1, 2)  
dummy_edge_index = torch.tensor([[0], [0]], dtype=torch.long) # Self-loop for dummy trace

# 3. Export
print("🔄 Converting model to ONNX...")
torch.onnx.export(
    model, 
    (dummy_x, dummy_edge_index), 
    "fraud_model.onnx",
    export_params=True,
    opset_version=11,
    do_constant_folding=True,
    input_names = ['x', 'edge_index'],
    output_names = ['output'],
    dynamic_axes={
        'x': {0: 'num_nodes'},          # Variable number of nodes in subgraph
        'edge_index': {1: 'num_edges'}  # Variable number of edges
    }
)

print("✅ Model exported to 'fraud_model.onnx'")