// Public, daily US equity/ETF research only. Never connects to a brokerage.
export const STOCKS = Object.freeze([
  "AAPL","MSFT","NVDA","AMD","GOOGL","AMZN","META","TSLA","AVGO","ORCL","CRM",
  "JPM","BAC","GS","V","MA","UNH","JNJ","LLY","ABBV","XOM","CVX",
  "CAT","GE","BA","WMT","COST","HD","MCD","KO","PEP",
  "SPY","QQQ","IWM","DIA","XLK","XLF","XLE","XLV","SOXX"
]);
function mean(nums) { return nums.reduce((a,b)=>a+b,0)/nums.length; }
export function analyzeDailyChart(payload, symbol, nowMs=Date.now()) {
  if (!STOCKS.includes(symbol) || !Number.isFinite(nowMs)) throw Error("invalid_stock_symbol");
  const record=payload?.chart?.result?.[0], meta=record?.meta;
  if (meta?.symbol!==symbol || meta?.currency!=="USD" || !["EQUITY","ETF"].includes(meta?.instrumentType))
    throw Error("unexpected_market_data_metadata");
  const ts=record?.timestamp, quote=record?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !quote || !Array.isArray(quote.close) || !Array.isArray(quote.volume) || !Array.isArray(quote.high))
    throw Error("invalid_price_series");
  const rows=[];
  for(let i=0;i<ts.length;i++){
    const ms=Number(ts[i])*1000, close=Number(quote.close[i]), high=Number(quote.high[i]), volume=Number(quote.volume[i]);
    if(!Number.isFinite(ms)||!Number.isFinite(close)||!Number.isFinite(high)||!Number.isFinite(volume)||
       close<=0||high<close||volume<0) continue;
    const day=new Date(ms).toISOString().slice(0,10);
    const today=new Date(nowMs).toISOString().slice(0,10);
    // Today's U.S. daily bar is still incomplete before 22:00 UTC.
    if(day===today && new Date(nowMs).getUTCHours()<22) continue;
    if(ms>nowMs) continue;
    rows.push({ms,day,close,high,volume});
  }
  rows.sort((a,b)=>a.ms-b.ms);
  if(rows.length<55)throw Error("insufficient_daily_bars");
  const last=rows.at(-1);
  if(nowMs-last.ms>8*86400_000)throw Error("stale_daily_data");
  const recent=rows.slice(-50), closes=recent.map(x=>x.close);
  const sma20=mean(closes.slice(-20)),sma50=mean(closes);
  const prior20High=Math.max(...recent.slice(-21,-1).map(x=>x.high));
  const avgUsdVolume20=mean(recent.slice(-20).map(x=>x.close*x.volume));
  const liquid=avgUsdVolume20>=20_000_000;
  const signal=liquid && sma20>sma50 && last.close>prior20High*1.002 ? "LONG_WATCH" : "NO_ENTRY";
  return {symbol,closedSession:last.day,close:Number(last.close.toFixed(4)),
    sma20:Number(sma20.toFixed(4)),sma50:Number(sma50.toFixed(4)),
    avgUsdVolume20:Math.round(avgUsdVolume20),signal,
    barsUsed:rows.length,ordersSubmitted:0,executionAllowed:false,realMoney:false};
}

// Retry only temporary network/provider failures. Invalid symbols and bad data still fail closed.
export async function retryMarketDataRequest(task,{sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=3,initialDelayMs=1500}={}){
  if(typeof task!=="function"||!Number.isInteger(attempts)||attempts<1||attempts>5||!Number.isFinite(initialDelayMs)||initialDelayMs<0) throw Error("invalid_retry_settings");
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await task();}
    catch(error){
      const message=String(error?.message??"");
      const retryable=error instanceof TypeError||["AbortError","TimeoutError"].includes(error?.name)||/^market_data_http_(408|429|500|502|503|504)$/.test(message)||/fetch failed/i.test(message);
      if(!retryable||attempt===attempts)throw error;
      await sleep(initialDelayMs*2**(attempt-1));
    }
  }
}
