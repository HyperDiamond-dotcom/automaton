// Atlas: Trading 212 DEMO read-only evidence; never places an order.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ORIGIN = "https://demo.trading212.com";
const API = ORIGIN + "/api/v0";
const HISTORY = "/api/v0/equity/history/orders";
const ALLOWED = new Set(["/api/v0/equity/account/summary",
  "/api/v0/equity/positions", "/api/v0/equity/orders", HISTORY]);

export function validateDemoPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//"))
    throw new Error("Relative DEMO API path required");
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || !ALLOWED.has(url.pathname)) throw new Error("DEMO read-only lock");
  if (url.pathname !== HISTORY && url.search) throw new Error("Unexpected query");
  if ([...url.searchParams.keys()].some(k => !["limit","cursor","ticker"].includes(k)))
    throw new Error("Unsafe history query");
  return url.pathname + url.search;
}

export async function demoGet(path, { key, secret, fetcher = fetch } = {}) {
  if (!key || !secret) throw new Error("DEMO credentials missing");
  const url = ORIGIN + validateDemoPath(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetcher(url, { method:"GET", signal:controller.signal,
      headers:{ Authorization:"Basic " + Buffer.from(key + ":" + secret).toString("base64"),
        Accept:"application/json" } });
    if (!response.ok) throw new Error("DEMO HTTP " + response.status);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

export async function snapshotDemo({ request, maxPages = 1, sleep = ms => new Promise(r => setTimeout(r,ms)) }) {
  if (typeof request !== "function" || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3)
    throw new Error("Invalid read-only collector settings");
  const account = await request("/api/v0/equity/account/summary");
  const positions = await request("/api/v0/equity/positions");
  const pending = await request("/api/v0/equity/orders");
  if (!account || Array.isArray(account) || !Array.isArray(positions) || !Array.isArray(pending))
    throw new Error("Malformed account, positions or pending orders");
  let next = HISTORY + "?limit=50", pages = 0;
  const records = [];
  while (next && pages < maxPages) {
    if (pages) await sleep(11000);
    const batch = await request(next);
    if (!batch || !Array.isArray(batch.items)) throw new Error("Malformed order history");
    records.push(...batch.items);
    pages++;
    next = batch.nextPagePath == null ? null : validateDemoPath(batch.nextPagePath);
    if (next && !next.startsWith(HISTORY)) throw new Error("Invalid nextPagePath");
  }
  return { account, positions, pending, records, pages, historyComplete:!next };
}

export function reconcileDemo(snapshot, evidence = null) {
  if (!snapshot || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.positions) ||
      !Array.isArray(snapshot.pending)) throw new Error("Invalid broker snapshot");
  const orders = new Map(), fills = new Set();
  let invalidRecords = 0;
  for (const item of snapshot.records) {
    const order = item?.order ?? item;
    if (order?.id == null || !order.status) { invalidRecords++; continue; }
    orders.set(String(order.id), order);
    if (item?.fill?.id != null) fills.add(String(item.fill.id));
  }
  const statusCounts = {};
  for (const order of orders.values())
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  const safeCount = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
  const submitted = safeCount(evidence?.submittedBuyOrders);
  const unsafe = safeCount(evidence?.unsafeCouncilApprovals);
  const blockers = [];
  if (!snapshot.historyComplete) blockers.push("Historical orders incomplete");
  if (invalidRecords) blockers.push("Unparseable broker orders");
  if (unsafe === null || unsafe > 0) blockers.push("Council approvals not verified safe");
  if (submitted != null) blockers.push("Order IDs must be matched before claims of confirmed fills");
  if (evidence == null) blockers.push("Atlas local evidence not supplied");
  return { environment:"DEMO / PRACTICE", auditedAt:new Date().toISOString(),
    historicalOrders:orders.size, historicalFillsObserved:fills.size, statusCounts,
    pendingOrders:snapshot.pending.length,
    positions:snapshot.positions.map(x => x.ticker ?? x.instrument?.ticker ?? null),
    historyComplete:snapshot.historyComplete, historyPages:snapshot.pages,
    localEvidence:{submittedBuyOrders:submitted,
      confirmedFilledBuyOrders:safeCount(evidence?.confirmedFilledBuyOrders),
      unsafeCouncilApprovals:unsafe},
    evidenceVerified:false, profitabilityDemonstrated:false,
    allowAutomaticOrders:false, blockers };
}

async function main() {
  const request = path => demoGet(path, {key:process.env.T212_API_KEY,
    secret:process.env.T212_API_SECRET});
  const snapshot = await snapshotDemo({request,maxPages:Number(process.env.ATLAS_HISTORY_PAGES || 1)});
  let evidence = null;
  if (process.env.ATLAS_EVIDENCE_REPORT_PATH)
    evidence = JSON.parse(await readFile(process.env.ATLAS_EVIDENCE_REPORT_PATH,"utf8"));
  console.log(JSON.stringify(reconcileDemo(snapshot,evidence),null,2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => { console.error("Atlas DEMO audit failed: " + error.message); process.exitCode=1; });
