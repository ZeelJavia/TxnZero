import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.API_URL || "http://host.docker.internal:8080";

/* =======================
   CUSTOM METRICS
======================= */
export const txnSuccessRate = new Rate("txn_success_rate");
export const txnFailureRate = new Rate("txn_failure_rate");
export const txnLatency = new Trend("txn_latency_ms");

/* =======================
   LOAD CONFIG (100 TPS)
======================= */
export const options = {
  scenarios: {
    payment_tps_test: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 300,
      stages: [
        { duration: "30s", target: 10 },   // warm-up
        { duration: "1m", target: 30 },
        { duration: "1m", target: 60 },
        { duration: "1m", target: 100 },  // 🎯 target TPS
        { duration: "30s", target: 0 },
      ],
    },
  },

  thresholds: {
    http_req_failed: ["rate<0.02"],          // < 2% infra failure
    http_req_duration: ["p(95)<3000"],       // p95 < 3s
    txn_success_rate: ["rate>0.98"],         // >98% tx success
    txn_latency_ms: ["p(95)<3000"],           // business latency
  },
};

/* =======================
   LOGIN (ONCE)
======================= */
export function setup() {
  const loginPayload = JSON.stringify({
    phoneNumber: "7984858394",
    password: "123456",
    deviceId: "device_1768839943786_09oynjxd",
  });

  const res = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "login status 200": (r) => r.status === 200,
    "AUTH_TOKEN present": (r) =>
      r.cookies?.AUTH_TOKEN?.length > 0,
  });

  return {
    authToken: res.cookies.AUTH_TOKEN[0].value,
  };
}

/* =======================
   PAYMENT TRANSACTION
======================= */
export default function (data) {
  // attach auth cookie
  http.cookieJar().set(BASE_URL, "AUTH_TOKEN", data.authToken);

  const payload = JSON.stringify({
    payerVpa: "7990370672@okaxis",
    payeeVpa: "7984858394@okaxis",
    amount: 30,
    mpin: "123456",
    deviceId: "device_1768839943786_09oynjxd",
  });

  const res = http.post(
    `${BASE_URL}/api/payments/initiate`,
    payload,
    { headers: { "Content-Type": "application/json" } }
  );

  txnLatency.add(res.timings.duration);

  const ok = check(res, {
    "txn http status 200": (r) => r.status === 200,
    "txn SUCCESS": (r) =>
      r.status === 200 && r.json("status") === "SUCCESS",
  });

  if (ok) {
    txnSuccessRate.add(1);
  } else {
    txnFailureRate.add(1);
  }
}
