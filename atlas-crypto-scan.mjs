// Scheduled discovery across active, liquid USD crypto spot markets. Read-only, never orders.
import { analyzeCandles } from "./atlas-crypto-core.mjs";
import { CANDIDATES, selectUniverse } from "./atlas-crypto-universe.mjs";

const BASE = "https://api.exchange.coinbase.com";
const granularity = 900;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function publicGet(path) {
  if (!path.startsWith("/products") || path.startsWith("//")) throw new Error("unsafe_market_data_path");
  const response = await fetch(BASE + path, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json", "User-Agent": "AtlasCryptoReadOnlyScanner/2.0" }
  });
  if (!response.ok) throw new Error("market_data_http_" + response.status);
  return response.json();
}
// Three bounded workers; no unbounded batch requests or credential use.
async function mapBounded(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({length: 3}, async () => {
    while (index < items.length) {
      const slot = index++;
      try { results[slot] = {status:"fulfilled",value:await worker(items[slot])}; }
      catch (error) { results[slot] = {status:"rejected",reason:error}; }
      await sleep(300);
    }
  }));
  return results;
}
async function run() {
  const [products, volumes] = await Promise.all([
    publicGet("/products"), publicGet("/products/volume-summary")
  ]);
  const quotes = Object.create(null);
  const quoteChecks = await mapBounded(CANDIDATES, async pair => {
    const ticker = await publicGet("/products/" + encodeURIComponent(pair) + "/ticker");
    quotes[pair] = ticker;
    return ticker;
  });
  const selected = selectUniverse(products, volumes, quotes);
  const quoteFailures = quoteChecks.filter(x => x.status === "rejected").length;
  console.log(JSON.stringify({event:"atlas_crypto_universe", mode:"READ_ONLY_PAPER_SIGNALS",
    candidates:CANDIDATES.length, qualified:selected.length, quoteFailures,
    minUsdVolume24h:1_500_000, maxSpreadPct:0.7, maxSelected:20,
    selection:selected.map(x => x.pair), ordersSubmitted:0, executionAllowed:false}));
  if (selected.length < 8) throw new Error("insufficient_liquid_markets");
  const checks = await mapBounded(selected, async ({pair,usdVolume24h,spreadPct}) => {
    const rows = await publicGet("/products/" + encodeURIComponent(pair) +
      "/candles?granularity=" + granularity);
    return {pair,status:"OK",usdVolume24h,spreadPct,
      ...analyzeCandles(rows,Date.now(),granularity)};
  });
  let errors = 0, watches = 0;
  for (let i = 0; i < selected.length; i++) {
    const item = checks[i];
    if (item.status === "fulfilled") {
      if (item.value.signal === "LONG_WATCH") watches++;
      console.log(JSON.stringify({event:"atlas_crypto_scan",source:"coinbase_exchange_public",
        mode:"READ_ONLY_PAPER_SIGNALS", realMoney:false,...item.value}));
    } else {
      errors++;
      console.error(JSON.stringify({event:"atlas_crypto_scan",pair:selected[i].pair,
        status:"FAILED",reason:String(item.reason?.message||item.reason),
        mode:"READ_ONLY_PAPER_SIGNALS",ordersSubmitted:0,executionAllowed:false}));
    }
  }
  console.log(JSON.stringify({event:"atlas_crypto_summary",selected:selected.length,
    scanned:selected.length-errors,errors,longWatchSignals:watches,
    ordersSubmitted:0,executionAllowed:false,realMoney:false}));
  if (errors) process.exitCode = 1;
}
await run().catch(error => {
  console.error(JSON.stringify({event:"atlas_crypto_scan_failed",
    reason:String(error?.message||error),ordersSubmitted:0,executionAllowed:false}));
  process.exitCode = 1;
});
