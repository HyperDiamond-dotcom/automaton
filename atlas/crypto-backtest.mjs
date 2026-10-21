import fs from 'node:fs';
import {initialState,evaluate,equity,SYMBOLS} from './crypto-paper.mjs';

const API='https://api.exchange.coinbase.com';
const INTERVAL=900;
const BAR_LIMIT=200;
export function fromCoinbase(rows){
 if(!Array.isArray(rows))throw Error('Invalid candles');
 const map=new Map();
 for(const row of rows){
   if(!Array.isArray(row)||row.length<5)throw Error('Invalid candle row');
   const [time,low,high,open,close]=row.map(Number);
   if(!Number.isInteger(time)||time%INTERVAL!==0||![low,high,open,close].every(x=>Number.isFinite(x)&&x>0)||low>high||low>Math.min(open,close)||high<Math.max(open,close))
     throw Error('Malformed historical candle');
   map.set(time,{time,open,close,high,low});
 }
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
export function assertAlignment(barsBySymbol){
 const a=barsBySymbol[SYMBOLS[0]],b=barsBySymbol[SYMBOLS[1]];
 if(!a||!b||a.length!==b.length||a.length<54)throw Error('Insufficient aligned history');
 for(let i=0;i<a.length;i++){
   if(a[i].time!==b[i].time)throw Error('Missing aligned candle');
   if(i&&a[i].time-a[i-1].time!==INTERVAL)throw Error('Historical candle gap');
 }
}
export function backtest(barsBySymbol){
 assertAlignment(barsBySymbol);
 const s=initialState(), rows=[],timestamps=barsBySymbol[SYMBOLS[0]];
 let maxDrawdown=0;
 for(let i=52;i<timestamps.length;i++){
   // Decisions use candles that have ALREADY closed; fills use the NEXT candle's open.
   const now=timestamps[i].time*1000+1000,market={};
   for(const sym of SYMBOLS){
     const all=barsBySymbol[sym], current=all[i];
     const price=current.open;
     market[sym]={bars:all.slice(i-52,i).map(v=>({time:v.time,close:v.close})),
       q:{price,bid:price*0.9998,ask:price*1.0002,time:new Date(now).toISOString()}};
   }
   const result=evaluate(s,market,now);
   maxDrawdown=Math.max(maxDrawdown,1-result.equity/s.peakEquity);
   rows.push({time:new Date(now).toISOString(),equity:result.equity,
     cash:s.cash,actions:result.decisions.map(d=>d.action),halted:s.halted});
 }
 const finalMarks=Object.fromEntries(SYMBOLS.map(sym=>[sym,barsBySymbol[sym].at(-1).close]));
 const finalEquity=equity(s,finalMarks);
 const matched={},profit=[];
 for(const fill of s.fills){
   if(fill.side==='BUY') matched[fill.symbol]=fill;
   else if(matched[fill.symbol]){
     const buy=matched[fill.symbol];
     profit.push(fill.qty*fill.price-fill.fee-buy.qty*buy.price-buy.fee);
     delete matched[fill.symbol];
   }
 }
 const fees=s.fills.reduce((a,f)=>a+f.fee,0);
 const initial=s.initialCash;
 const bench=SYMBOLS.reduce((a,sym)=>{
  const z=barsBySymbol[sym];
  return a+0.5*(z.at(-1).close/z[52].open);
 },0);
 return {
  disclaimer:'Historical simulation only. Coinbase candles; next-bar-open synthetic quotes; 0.04% spread, 0.1% slippage and 0.6% fee per side. Stop/target checked at bar open only; not live or predictive.',
  periodStart:new Date(timestamps[52].time*1000).toISOString(),
  periodEnd:new Date(timestamps.at(-1).time*1000).toISOString(),
  barsEvaluated:rows.length,startingVirtualUSD:initial,endingVirtualUSD:Number(finalEquity.toFixed(2)),
  netReturnPct:Number(((finalEquity/initial-1)*100).toFixed(3)),
  buyAndHoldBenchmarkPct:Number(((bench-1)*100).toFixed(3)),
  maximumObservedDrawdownPct:Number((maxDrawdown*100).toFixed(3)),
  orders:s.fills.length,completedRoundTrips:profit.length,
  winningRoundTrips:profit.filter(x=>x>0).length,
  simulatedFeesUSD:Number(fees.toFixed(2)),
  halted:s.halted,haltReason:s.haltReason,remainingPositions:Object.keys(s.positions),
  observations:rows,
 };
}
export async function fetchHistory(days=30,fetcher=fetch){
 if(!Number.isInteger(days)||days<1||days>90)throw Error('Historical days must be 1 to 90');
 const end=Math.floor(Date.now()/900000)*900000;
 const start=end-days*86400000,result={};
 for(const sym of SYMBOLS){
   let rows=[];
   for(let t=start;t<end;t+=BAR_LIMIT*INTERVAL*1000){
     const stop=Math.min(end,t+BAR_LIMIT*INTERVAL*1000);
     const url=API+'/products/'+sym+'/candles?granularity=900&start='+encodeURIComponent(new Date(t).toISOString())+'&end='+encodeURIComponent(new Date(stop).toISOString());
     const resp=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
     if(!resp.ok)throw Error('Historical price fetch failed: '+sym+' HTTP '+resp.status);
     rows.push(...await resp.json());
     await new Promise(resolve=>setTimeout(resolve,250));
   }
   result[sym]=fromCoinbase(rows).filter(row=>row.time*1000>=start&&row.time*1000<end);
 }
 return result;
}
if(process.argv[1]?.endsWith('/crypto-backtest.mjs')){
 const days=Number(process.argv[2]||30);
 try {
   const r=backtest(await fetchHistory(days));
   const outfile=process.env.ATLAS_BACKTEST_REPORT;
   if(outfile)fs.writeFileSync(outfile,JSON.stringify(r,null,2));
   const {observations,...summary}=r;
   console.log(JSON.stringify(summary,null,2));
 } catch(err){console.error('BACKTEST_FAILED',String(err.message||err));process.exitCode=1;}
}
