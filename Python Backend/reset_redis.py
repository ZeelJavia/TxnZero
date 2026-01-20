import redis

r = redis.Redis(host='localhost', port=6379, db=0)
r.delete("sync:last_user_time")
r.delete("sync:last_txn_time")

print("✅ Sync state reset! The engine will now fetch ALL data from the beginning.")