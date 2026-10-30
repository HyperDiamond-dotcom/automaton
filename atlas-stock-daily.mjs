// Read-only, end-of-day research. Unofficial Yahoo chart endpoint may change or rate-limit.
// No financial account API, credentials, trading functions, or exchange orders.
import {STOCKS,analyzeDailyChart,retryMarketDataRequest} from "./atlas-stock-daily-core.mjs";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchChart(symbol) {
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+
    encodeURIComponent(symbol)+"?range=6mo&interval=1d";
  const response=await fetch(url,{method:"GET",redirect:"error",
    signal:AbortSignal.timeout(12000),
    headers:{Accept:"application/json","User-Agent":"Mozilla/5.0 AtlasReadOnlyResearch/1.0"}});
  if(!response.ok)throw Error("market_data_http_"+response.status);
  return response.json();
}
let next=0;
const results=new Array(STOCKS.length);
await Promise.all(Array.from({length:2},async()=>{
  while(next<STOCKS.length){
    const i=next++, symbol=STOCKS[i];
    try { const chart=await retryMarketDataRequest(()=>fetchChart(symbol)); results[i]={status:"OK",...analyzeDailyChart(chart,symbol)}; }
    catch(e){results[i]={symbol,status:"FAILED",reason:String(e?.message||e)};}
    await sleep(650);
  }
}));
let successes=0,watches=0,failures=0;
for (const item of results) {
  if(item.status==="OK"){successes++;if(item.signal==="LONG_WATCH")watches++;}
  else failures++;
  console.log(JSON.stringify({event:"atlas_stock_daily",mode:"READ_ONLY_RESEARCH",...item}));
}
console.log(JSON.stringify({event:"atlas_stock_summary",candidates:STOCKS.length,
  scanned:successes,failures,longWatchSignals:watches,ordersSubmitted:0,
  executionAllowed:false,realMoney:false,provider:"public_unofficial_yahoo_daily"}));
if(failures)process.exitCode=1;
