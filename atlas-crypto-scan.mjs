// Read-only, cron-driven Atlas crypto data scanner. No trading functions exist.
import { analyzeCandles } from "./atlas-crypto-core.mjs";

const pairs = ["BTC-USD", "ETH-USD"];
const granularity = 900;
async function checkPair(pair) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const url = "https://api.exchange.coinbase.com/products/" +
      encodeURIComponent(pair) + "/candles?granularity=" + granularity;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "AtlasCryptoPaperScanner/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("market_data_http_" + response.status);
    const rows = await response.json();
    return { pair, status: "OK", ...analyzeCandles(rows, Date.now(), granularity) };
  } finally {
    clearTimeout(timeout);
  }
}
const results = await Promise.allSettled(pairs.map(checkPair));
let failures = 0;
for (let i = 0; i < results.length; i++) {
  const item = results[i];
  if (item.status === "fulfilled") {
    console.log(JSON.stringify({ event: "atlas_crypto_scan", source: "coinbase_exchange_public",
      mode: "READ_ONLY_PAPER_SIGNALS", realMoney: false, ...item.value }));
  } else {
    failures++;
    console.error(JSON.stringify({ event: "atlas_crypto_scan", pair: pairs[i],
      status: "FAILED", reason: String(item.reason instanceof Error ? item.reason.message : item.reason),
      mode: "READ_ONLY_PAPER_SIGNALS", ordersSubmitted: 0 }));
  }
}
if (failures) process.exitCode = 1;
