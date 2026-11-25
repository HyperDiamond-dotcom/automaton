// Five-minute regular-session bars. Thresholds are descriptive, never sell instructions.
export function classify(chart, symbol, now) {
  const data = chart?.chart?.result?.[0];
  const meta = data?.meta;
  const session = meta?.currentTradingPeriod?.regular;
  if (meta?.symbol !== symbol || meta?.currency !== 'USD' || meta?.instrumentType !== 'EQUITY' ||
      !Number.isFinite(session?.start) || !Number.isFinite(session?.end)) return { status: 'UNVERIFIED_INSTRUMENT' };
  if (now < session.start || now >= session.end) return { status: 'SESSION_CLOSED' };
  const quote = data.indicators?.quote?.[0];
  const bars = (data.timestamp ?? []).map((time,i) => ({
    time, open: quote?.open?.[i], high: quote?.high?.[i], close: quote?.close?.[i], volume: quote?.volume?.[i]
  })).filter(b => b.time >= session.start && b.time + 300 <= now &&
    [b.open,b.high,b.close,b.volume].every(v => Number.isFinite(v) && v > 0));
  const last = bars.at(-1);
  if (bars.length < 2 || now - last.time > 600 || meta.exchangeDataDelayedBy > 0 ||
      !Number.isFinite(meta.regularMarketTime) || now - meta.regularMarketTime > 600) return { status: 'AWAITING_FRESH_BARS' };
  const high = Math.max(...bars.map(b => b.high));
  const open = meta.regularMarketOpen ?? bars[0].open;
  if (!(open > 0)) return { status: 'MISSING_OPEN' };
  const lastClose = last.close;
  const gain = lastClose / open - 1;
  const pullback = 1 - lastClose / high;
  const status = gain >= 0.05 && pullback <= 0.01 ? 'STRENGTH' :
    high / open >= 1.05 && pullback >= 0.03 ? 'RALLY_FADING' : 'WATCH';
  return { status, gainFromOpenPct: +(100*gain).toFixed(2), belowHighPct: +(100*pullback).toFixed(2),
    completedBarAt: new Date((last.time+300)*1000).toISOString() };
}

export async function scanHolding(ticker, transport = fetch) {
  const symbol = /^([A-Z]{1,6})_US_EQ$/.exec(ticker)?.[1];
  if (!symbol) return { ticker, status: 'UNSUPPORTED_MARKET' };
  try {
    const res = await transport('https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?interval=5m&range=1d', {
      redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 AtlasResearch' }
    });
    if (!res.ok) return { ticker, status: 'MARKET_DATA_UNAVAILABLE' };
    return { ticker, ...classify(await res.json(), symbol, Date.now()/1000) };
  } catch { return { ticker, status: 'MARKET_DATA_UNAVAILABLE' }; }
}
