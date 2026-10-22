// Atlas crypto paper signal evaluation. No exchange credentials, wallets or order APIs.
export function analyzeCandles(rows, nowMs = Date.now(), granularitySec = 900) {
  if (!Array.isArray(rows)) throw new Error("candles_not_array");
  const candles = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 6) throw new Error("malformed_candle");
    const [time, low, high, open, close, volume] = row.map(Number);
    if (![time, low, high, open, close, volume].every(Number.isFinite)
        || time <= 0 || low <= 0 || high <= 0 || open <= 0 || close <= 0 || volume < 0
        || high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
      throw new Error("invalid_candle");
    }
    return { time, low, high, open, close, volume };
  }).filter((c) => (c.time + granularitySec) * 1000 <= nowMs - 15000)
    .sort((a, b) => a.time - b.time);
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time === candles[i - 1].time) throw new Error("duplicate_candle");
  }
  if (candles.length < 50) throw new Error("insufficient_closed_candles");
  const last = candles.at(-1);
  const ageSec = nowMs / 1000 - (last.time + granularitySec);
  if (ageSec > granularitySec * 2 + 300) throw new Error("stale_market_data");
  const closes = candles.map((c) => c.close);
  function ema(period) {
    let value = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const factor = 2 / (period + 1);
    for (let i = period; i < closes.length; i++) value += factor * (closes[i] - value);
    return value;
  }
  let trSum = 0;
  for (let i = candles.length - 14; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    trSum += Math.max(candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev), Math.abs(candles[i].low - prev));
  }
  const atrPct = 100 * trSum / 14 / last.close;
  const ema12 = ema(12), ema26 = ema(26);
  const prior20High = Math.max(...candles.slice(-21, -1).map((c) => c.high));
  let signal = "NO_ENTRY";
  if (atrPct > 4) signal = "NO_ENTRY_HIGH_VOLATILITY";
  else if (ema12 > ema26 * 1.002 && last.close > prior20High * 1.001) signal = "LONG_WATCH";
  return {
    closedCandleUtc: new Date((last.time + granularitySec) * 1000).toISOString(),
    close: last.close,
    ema12: Number(ema12.toFixed(6)),
    ema26: Number(ema26.toFixed(6)),
    atrPct: Number(atrPct.toFixed(3)),
    signal,
    candlesUsed: candles.length,
    marketDataAgeSeconds: Math.round(ageSec),
    ordersSubmitted: 0,
    executionAllowed: false
  };
}
