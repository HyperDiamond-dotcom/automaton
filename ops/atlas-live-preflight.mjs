// Trading 212 LIVE account connectivity preflight.
// GET-only by construction. No trading endpoints, order writes, or execution switches.
import { pathToFileURL } from "node:url";

const BASE = "https://live.trading212.com/api/v0";
const ENDPOINTS = Object.freeze({
  summary: "/equity/account/summary",
  positions: "/equity/positions",
  orders: "/equity/orders"
});

export function readOnlyUrl(path) {
  if (!Object.values(ENDPOINTS).includes(path)) throw Error("read_only_endpoint_required");
  return BASE + path;
}

async function getLive(path, credentials, transport) {
  const url = readOnlyUrl(path);
  if (typeof credentials?.key !== "string" || !credentials.key.trim() ||
      typeof credentials?.secret !== "string" || !credentials.secret.trim()) {
    throw Error("separate_live_api_credentials_required");
  }
  const token = Buffer.from(credentials.key + ":" + credentials.secret).toString("base64");
  const response = await transport(url, {
    method: "GET",
    headers: { Authorization: "Basic " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response?.ok) throw Error("live_api_http_" + (response?.status ?? "unknown"));
  try { return await response.json(); }
  catch { throw Error("invalid_live_api_json"); }
}

export async function livePreflight(credentials, transport = fetch, pause = ms => new Promise(r => setTimeout(r, ms))) {
  // Intentionally no POST / PUT / PATCH / DELETE or trade-order path.
  const summary = await getLive(ENDPOINTS.summary, credentials, transport);
  await pause(1200);
  const positions = await getLive(ENDPOINTS.positions, credentials, transport);
  await pause(1200);
  const orders = await getLive(ENDPOINTS.orders, credentials, transport);
  if (!summary || typeof summary !== "object" || Array.isArray(summary) ||
      !Array.isArray(positions) || !Array.isArray(orders)) {
    throw Error("unexpected_live_broker_response");
  }
  return {
    status: "LIVE_API_READ_ONLY_VERIFIED",
    checkedAt: new Date().toISOString(),
    liveBrokerReachable: true,
    positionsObserved: positions.length,
    pendingOrdersObserved: orders.length,
    brokerOrderWrites: 0,
    automaticOrdersEnabled: false,
    journalReconciled: false,
    strategyProfitabilityProven: false,
    liveAutoTradingReady: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  livePreflight({
    key: process.env.T212_LIVE_API_KEY,
    secret: process.env.T212_LIVE_API_SECRET
  }).then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => { console.error("Live preflight failed:", error.message); process.exitCode = 1; });
}
