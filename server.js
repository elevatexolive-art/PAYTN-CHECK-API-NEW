const path = require("path");
const express = require("express");

const PAYTM_ENDPOINTS = [
  "https://securegw.paytm.in/merchant-status/getTxnStatus",
  "https://securegw.paytm.in/order/status",
  "https://secure.paytmpayments.com/order/status",
];
const ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 3500;
const RETRY_GAP_MS = 400;
const USER_AGENT = "TheDrunkBots-PayCheck/1.0";
const PUBLIC = path.join(__dirname, "public");

function emptyTxn(extra = {}) {
  return {
    TXNID: "",
    BANKTXNID: "",
    ORDERID: "",
    TXNAMOUNT: "",
    STATUS: "TXN_FAILURE",
    TXNTYPE: "",
    GATEWAYNAME: "",
    RESPCODE: "",
    RESPMSG: "",
    BANKNAME: "",
    MID: "",
    PAYMENTMODE: "",
    REFUNDAMT: "",
    TXNDATE: "",
    ...extra,
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readMidOid(req) {
  const q = req.query || {};
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const mid = firstString(q.mid, q.MID, b.mid, b.MID);
  const oid = firstString(
    q.oid,
    q.id,
    q.orderId,
    q.order_id,
    q.ORDERID,
    b.oid,
    b.id,
    b.orderId,
    b.order_id,
    b.ORDERID,
  );
  return { mid, oid };
}

function isPaytmPayload(data) {
  return Boolean(data && typeof data === "object" && (data.STATUS || data.RESPCODE || data.RESPMSG || data.ORDERID));
}

function normalize(parsed, mid, oid) {
  const resp = parsed.RESPCODE || "";
  let status = parsed.STATUS || "";
  if (!status) status = resp === "01" ? "TXN_SUCCESS" : "TXN_FAILURE";
  return {
    TXNID: parsed.TXNID || "",
    BANKTXNID: parsed.BANKTXNID || "",
    ORDERID: parsed.ORDERID || oid,
    TXNAMOUNT: parsed.TXNAMOUNT || "",
    STATUS: status,
    TXNTYPE: parsed.TXNTYPE || "",
    GATEWAYNAME: parsed.GATEWAYNAME || "",
    RESPCODE: resp,
    RESPMSG: parsed.RESPMSG || "",
    BANKNAME: parsed.BANKNAME || "",
    MID: parsed.MID || mid,
    PAYMENTMODE: parsed.PAYMENTMODE || "",
    REFUNDAMT: parsed.REFUNDAMT || "",
    TXNDATE: parsed.TXNDATE || "",
    POS_ID: parsed.POS_ID || "",
    UDF_1: parsed.UDF_1 || "",
    currentTxnCount: parsed.currentTxnCount || "",
  };
}

function isSettledFailure(txn) {
  const code = txn.RESPCODE || "";
  if (txn.STATUS === "TXN_SUCCESS" || txn.STATUS === "PENDING") return false;
  if (code === "334" || code === "335" || code === "400" || code === "503") return false;
  return txn.STATUS === "TXN_FAILURE" && Boolean(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hitEndpoint(endpoint, mid, oid) {
  const payload = JSON.stringify({ MID: mid, ORDERID: oid });
  const bodies = [payload, `JsonData=${payload}`];
  for (const body of bodies) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (isPaytmPayload(parsed)) return normalize(parsed, mid, oid);
    } catch {
      continue;
    }
  }
  return null;
}

async function queryPaytm(mid, oid) {
  let last = null;
  for (let round = 0; round < ATTEMPTS; round += 1) {
    const settled = await Promise.allSettled(PAYTM_ENDPOINTS.map((endpoint) => hitEndpoint(endpoint, mid, oid)));
    const found = [];
    for (const item of settled) {
      if (item.status === "fulfilled" && item.value) found.push(item.value);
    }
    const success = found.find((txn) => txn.STATUS === "TXN_SUCCESS" && txn.RESPCODE === "01");
    if (success) return success;
    const pending = found.find((txn) => txn.STATUS === "PENDING");
    const hardFail = found.find(isSettledFailure);
    const notYet = found.find((txn) => txn.RESPCODE === "334" || txn.RESPCODE === "335");
    if (hardFail) return hardFail;
    if (pending) last = pending;
    else if (notYet) last = notYet;
    else if (found[0]) last = found[0];
    if (round < ATTEMPTS - 1) await sleep(RETRY_GAP_MS * (round + 1));
  }
  if (last) return last;
  return emptyTxn({
    STATUS: "PENDING",
    RESPCODE: "400",
    RESPMSG: "Paytm still settling — retry",
    ORDERID: oid,
    MID: mid,
  });
}

function requiredApiKey() {
  return String(process.env.PAYTM_API_KEY || process.env.API_KEY || "").trim();
}

function unauthorized(req, res) {
  const required = requiredApiKey();
  if (!required) return false;
  const header = req.get("x-api-key") || "";
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const queryKey = req.query.key || "";
  const provided = String(header || bearer || queryKey).trim();
  if (provided !== required) {
    res.status(401).json(emptyTxn({ STATUS: "TXN_FAILURE", RESPCODE: "401", RESPMSG: "Invalid API key" }));
    return true;
  }
  return false;
}

async function handleVerify(req, res) {
  try {
    if (unauthorized(req, res)) return;
    const { mid, oid } = readMidOid(req);
    if (!mid || !oid) {
      return res.status(200).json(
        emptyTxn({
          STATUS: "TXN_FAILURE",
          RESPCODE: "400",
          RESPMSG: "Missing mid or oid",
          ORDERID: oid,
          MID: mid,
        }),
      );
    }
    const result = await queryPaytm(mid, oid);
    return res.status(200).json(result);
  } catch {
    return res.status(200).json(
      emptyTxn({ STATUS: "PENDING", RESPCODE: "400", RESPMSG: "Paytm still settling — retry" }),
    );
  }
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "thedrunkbots-paycheck",
    gateway: "paytm",
    ts: new Date().toISOString(),
  });
});

app.get("/api/verify", handleVerify);
app.post("/api/verify", handleVerify);
app.get("/api", handleVerify);
app.post("/api", handleVerify);

app.use(express.static(PUBLIC));

app.get("/", (req, res, next) => {
  const { mid } = readMidOid(req);
  const { oid } = readMidOid(req);
  if (mid && oid) return handleVerify(req, res);
  res.sendFile(path.join(PUBLIC, "index.html"), (err) => (err ? next(err) : undefined));
});

app.post("/", handleVerify);

app.get("/docs", (_req, res) => {
  res.sendFile(path.join(PUBLIC, "docs.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log("TheDrunkBots Pay Check API listening on " + port);
});
