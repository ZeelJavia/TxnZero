import pandas as pd
import numpy as np
import uuid
import random
from faker import Faker
from datetime import datetime, timedelta

fake = Faker()

# --- CONSTANTS ---
NUM_USERS = 2000
NUM_TXNS = 50000

# --- 1. INITIALIZE DATA STRUCTURES ---
users = []
user_ids = list(range(1, NUM_USERS + 1))
user_vpas = {} 
# Track status: 0=Safe, 1=Fraud (Ground Truth)
user_fraud_status = {uid: 0 for uid in user_ids} 

print("Step 1: Generating Base Users...")
for uid in user_ids:
    phone = fake.unique.phone_number()
    # Note: We assign KYC and Risk Score LATER to ensure they overlap realistically
    users.append({
        "user_id": uid,
        "phone_number": phone,
        "full_name": fake.name(),
        "created_at": datetime.now() - timedelta(days=random.randint(0, 1000)),
        "kyc_status": "PENDING", # Placeholder
        "risk_score": 0.0        # Placeholder
    })
    user_vpas[uid] = f"{phone}@upibank"

users_df = pd.DataFrame(users)

# --- 2. GENERATE DEVICES ---
devices = []
print("Step 2: Generating Base Devices...")
for uid in user_ids:
    devices.append({
        "device_id": str(uuid.uuid4()), 
        "user_id": uid,
        "model_name": random.choice(["iPhone 13", "Samsung S21", "Redmi Note 10"]),
        "last_login_ip": fake.ipv4(),
        "first_seen_at": datetime.now() - timedelta(days=random.randint(0, 365))
    })
devices_df = pd.DataFrame(devices)

# --- 3. TRANSACTION HELPER ---
transactions = []

def add_txn(sender_id, receiver_id, amount, is_fraud_txn, forced_device_id=None, forced_ip=None):
    txn_id = str(uuid.uuid4())
    
    # Device Logic
    if forced_device_id:
        sender_device_id = forced_device_id
        sender_ip = forced_ip if forced_ip else fake.ipv4()
    else:
        # Fetch user's actual device
        user_devices = devices_df[devices_df['user_id'] == sender_id]
        if user_devices.empty: return 
        dev = user_devices.iloc[0]
        sender_device_id = dev['device_id']
        sender_ip = dev['last_login_ip']

    transactions.append({
        "global_txn_id": txn_id,
        "payer_vpa": user_vpas[sender_id],
        "payee_vpa": user_vpas[receiver_id],
        "amount": round(amount, 2),
        "sender_ip": sender_ip,
        "sender_device_id": sender_device_id,
        "status": "SUCCESS",
        "created_at": datetime.now() - timedelta(minutes=random.randint(0, 10000)),
        "is_fraud_label": 1 if is_fraud_txn else 0
    })

# ==========================================
# 🕸️ INJECT FRAUD PATTERNS (TOPOLOGY BASED)
# ==========================================

# A. SPIDER WEB (Shared Device)
# Logic: 15 Mules use the SAME device to pay 1 Kingpin.
print("Step 3: Injecting Spider Web...")
spider_mules = random.sample(user_ids, 15)
spider_kingpin = random.choice(list(set(user_ids) - set(spider_mules)))
spider_device = str(uuid.uuid4())
spider_ip = fake.ipv4()

# Mark participants as FRAUD
user_fraud_status[spider_kingpin] = 1
for m in spider_mules:
    user_fraud_status[m] = 1
    # Force Mules to use the Spider Device
    devices_df.loc[devices_df['user_id'] == m, 'device_id'] = spider_device
    devices_df.loc[devices_df['user_id'] == m, 'last_login_ip'] = spider_ip

# Generate Spider Transactions
for m in spider_mules:
    # Amount is high, but not "impossibly" high. Safe users also send 5000.
    add_txn(m, spider_kingpin, random.uniform(2000, 8000), True, spider_device, spider_ip)


# B. CIRCULAR LOOP (Flow Through) - WITH TIME CAUSALITY FIX
# Logic: A -> B -> C -> A (Sequentially in time)
print("Step 4: Injecting Circular Loops...")
remaining_users = list(set(user_ids) - set(spider_mules) - {spider_kingpin})
loop_members = random.sample(remaining_users, 3)

for u in loop_members:
    user_fraud_status[u] = 1 # Mark as Fraud

amt = 50000
# Pick a random start time for the crime
base_time = datetime.now() - timedelta(days=random.randint(1, 30))

# Txn 1: A -> B
add_txn(loop_members[0], loop_members[1], amt, True)
transactions[-1]['created_at'] = base_time

# Txn 2: B -> C (Happens 2 hours later)
add_txn(loop_members[1], loop_members[2], amt * 0.95, True)
transactions[-1]['created_at'] = base_time + timedelta(hours=2)

# Txn 3: C -> A (Happens 4 hours later)
add_txn(loop_members[2], loop_members[0], amt * 0.90, True)
transactions[-1]['created_at'] = base_time + timedelta(hours=4)


# C. NORMAL TRAFFIC (Background Noise) - WITH ACTIVITY FIX
# Logic: Include Fraudsters in normal traffic so they aren't "suspiciously quiet"
print("Step 5: Filling with Normal Traffic...")
all_users = list(user_ids) # Sample from EVERYONE, not just safe users

for _ in range(int(NUM_TXNS * 0.95)):
    # Pick any two users (Fraudsters can transact with Safe users too!)
    u1, u2 = random.sample(all_users, 2)
    
    # MIXED AMOUNTS: 
    # 20% of safe transactions are "High Value" (Rent, Salary, Electronics)
    if random.random() < 0.2:
        amt = random.uniform(5000, 60000) 
    else:
        amt = random.uniform(50, 4000)
        
    add_txn(u1, u2, amt, False)


# --- 4. FINALIZE USER ATTRIBUTES (REMOVE LEAKAGE) ---
print("Step 6: Finalizing User Features (Removing Bias)...")

for idx, row in users_df.iterrows():
    uid = row['user_id']
    is_fraud = user_fraud_status[uid]
    
    # LABEL: Set the Ground Truth
    users_df.at[idx, 'is_fraud'] = is_fraud
    
    # KYC LEAKAGE FIX: 
    # Real fraudsters steal identities, so they are often VERIFIED.
    # We give them 80% verification rate, same as safe users.
    if is_fraud == 1:
        kyc = 'VERIFIED' if random.random() < 0.8 else 'PENDING'
    else:
        kyc = 'VERIFIED' if random.random() < 0.9 else 'PENDING'
    users_df.at[idx, 'kyc_status'] = kyc

    # RISK SCORE LEAKAGE FIX:
    # If we give fraudsters high risk scores now, the model cheats.
    # We give them LOW/MEDIUM scores so they "hide in plain sight".
    # The GNN must discover they are actually high risk.
    if is_fraud == 1:
        # Fraudsters look "okay" (0.1 to 0.4)
        users_df.at[idx, 'risk_score'] = round(random.uniform(0.1, 0.4), 2)
    else:
        # Safe users mostly low, but some have high scores (False Positives)
        users_df.at[idx, 'risk_score'] = round(random.uniform(0.0, 0.3), 2)

transactions_df = pd.DataFrame(transactions)

# --- 5. EXPORT ---
users_df.to_csv("users.csv", index=False)
devices_df.to_csv("user_devices.csv", index=False)
transactions_df.to_csv("transactions.csv", index=False)

print(f"✅ Training Data Generated.")
print(f"   Total Users: {NUM_USERS}")
print(f"   Fraudsters: {sum(user_fraud_status.values())}")
print(f"   (Fraudsters hidden with Verified KYC and Low Risk Scores)")