// Atlas historical paper validation: public Coinbase data only; no order API.
import {simulateAtlas} from './atlas-paper-backtest-core.mjs';
const PAIRS=['BTC-USD','ETH-USD','SOL-USD'];
const BAR_SECONDS=900, DAYS=30, CHUNK_BARS=192, PAUSE_MS=500;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchChunk(pair,from,to) {
  const url=new URL(`https://api.exchange.coinbase.com/products/${pair}/candles`);
  url.searchParams.set('granularity',String(BAR_SECONDS));
  url.searchParams.set('start',new Date(from*1000).toISOString());
  url.searchParams.set('end',new Date(to*1000).toISOString());
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const resp=await fetch(url,{method:'GET',redirect:'error',
        signal:AbortSignal.timeout(12000),
        headers:{Accept:'application/json','User-Agent':'AtlasPaperValidation/1.0'}});
      if(!resp.ok) {
        if((resp.status===429||resp.status>=500)&&attempt<3) {
          await sleep(attempt*2500);continue;
        }
        throw Error('coinbase_http_'+resp.status);
      }
      const rows=await resp.json();
      if(!Array.isArray(rows)) throw Error('invalid_coinbase_data');
      return rows.filter(r=>Array.isArray(r)&&Number(r[0])>=from&&Number(r[0])<to);
    } catch(error) {
      if(attempt===3 || !['TimeoutError','AbortError','TypeError'].includes(error?.name)) throw error;
      await sleep(attempt*2500);
    }
  }
  throw Error('history_download_failed');
}
export async function fetchHistory(pair,endSec,days=DAYS) {
  if(!PAIRS.includes(pair))throw Error('unsupported_pair');
  if(!Number.isInteger(endSec)||endSec%BAR_SECONDS || !Number.isInteger(days)||days<3||days>90)
    throw Error('invalid_history_window');
  const startSec=endSec-days*86400;
  const byTime=new Map();
  for(let from=startSec;from<endSec;from+=CHUNK_BARS*BAR_SECONDS) {
    const to=Math.min(from+CHUNK_BARS*BAR_SECONDS,endSec);
    const rows=await fetchChunk(pair,from,to);
    for(const row of rows)byTime.set(Number(row[0]),row);
    await sleep(PAUSE_MS);
  }
  const candles=[...byTime.values()].sort((a,b)=>Number(a[0])-Number(b[0]));
  const expected=days*86400/BAR_SECONDS;
  if(candles.length!==expected || Number(candles[0]?.[0])!==startSec ||
     Number(candles.at(-1)?.[0])!==endSec-BAR_SECONDS)
    throw Error(`incomplete_history_${candles.length}_of_${expected}`);
  return candles;
}
async function main() {
  const endSec=Math.floor((Date.now()-30000)/1000/BAR_SECONDS)*BAR_SECONDS;
  const reports=[];let failures=0;
  for(const pair of PAIRS) {
    try {
      const rows=await fetchHistory(pair,endSec);
      const {trades,equityCurve,...summary}=simulateAtlas(rows);
      const report={event:'atlas_paper_validation',pair,source:'coinbase_public_candles',
        dataWindowDays:DAYS, ...summary,lastFiveTrades:trades.slice(-5)};
      console.log(JSON.stringify(report));reports.push(report);
    } catch(error) {
      failures++;
      console.error(JSON.stringify({event:'atlas_paper_validation_failure',pair,
        reason:String(error?.message||error),liveReady:false,ordersSubmitted:0}));
    }
  }
  console.log(JSON.stringify({event:'atlas_paper_validation_summary',
    pairsAttempted:PAIRS.length,pairsSucceeded:reports.length,failures,
    sampleSufficient:reports.every(r=>r.sampleSufficient)&&reports.length===PAIRS.length,
    independentlyVerified:false,liveReady:false,ordersSubmitted:0,
    note:'Research backtest only; next-bar simulated fills and costs are assumptions.'}));
  if(failures)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href) {
  await main();
}
