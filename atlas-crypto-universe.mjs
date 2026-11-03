// Public-data-only crypto universe. No API credentials, trading or wallet operations.
export const CANDIDATES = Object.freeze([
  "BTC-USD","ETH-USD","SOL-USD","XRP-USD","ADA-USD","DOGE-USD",
  "LINK-USD","AVAX-USD","LTC-USD","BCH-USD","DOT-USD","UNI-USD",
  "AAVE-USD","XLM-USD","ATOM-USD","NEAR-USD","HBAR-USD","SUI-USD",
  "APT-USD","ARB-USD","OP-USD","INJ-USD","SEI-USD","FIL-USD",
  "ICP-USD","ALGO-USD","ETC-USD","POL-USD","GRT-USD","COMP-USD","ZEC-USD"
]);
export const MAX_PAIRS = 20;
export const MIN_USD_VOLUME_24H = 1_500_000;
export const MAX_SPREAD_PCT = 0.7;

export function selectUniverse(products, volumes, quotes, nowMs = Date.now()) {
  if (!Array.isArray(products) || !Array.isArray(volumes) ||
      !quotes || typeof quotes !== "object" || !Number.isFinite(nowMs)) {
    throw new Error("invalid_universe_inputs");
  }
  const active = new Map(products.filter(p => typeof p?.id === "string").map(p => [p.id, p]));
  const volume = new Map(volumes.filter(v => typeof v?.id === "string").map(v => [v.id, v]));
  const eligible = [];
  for (const pair of CANDIDATES) {
    const p = active.get(pair), v = volume.get(pair), q = quotes[pair];
    if (!p || p.status !== "online" || p.trading_disabled || p.cancel_only ||
        p.post_only || p.limit_only || p.quote_currency !== "USD" ||
        !v || !Array.isArray(v.market_types) || !v.market_types.includes("spot") || !q) continue;
    const bid = Number(q.bid), ask = Number(q.ask), price = Number(q.price);
    const baseVolume = Number(v.spot_volume_24hour);
    const age = nowMs - Date.parse(q.time);
    if (![bid, ask, price, baseVolume, age].every(Number.isFinite) ||
        bid <= 0 || ask < bid || price <= 0 || baseVolume <= 0 ||
        age < -60_000 || age > 15 * 60_000) continue;
    const spreadPct = (ask - bid) / ((ask + bid) / 2) * 100;
    const usdVolume24h = baseVolume * price; // approximate; base-asset volume x latest USD price
    if (!Number.isFinite(usdVolume24h) || usdVolume24h < MIN_USD_VOLUME_24H ||
        spreadPct > MAX_SPREAD_PCT) continue;
    eligible.push({ pair, usdVolume24h: Math.round(usdVolume24h),
      spreadPct: Number(spreadPct.toFixed(4)) });
  }
  eligible.sort((a,b) => b.usdVolume24h - a.usdVolume24h || a.pair.localeCompare(b.pair));
  // Keep BTC and ETH included if they independently pass all safety filters.
  const anchors = ["BTC-USD","ETH-USD"].map(p => eligible.find(x => x.pair === p)).filter(Boolean);
  const remaining = eligible.filter(x => !anchors.some(a => a.pair === x.pair));
  return [...anchors, ...remaining].slice(0, MAX_PAIRS);
}
