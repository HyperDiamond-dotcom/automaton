// Local offline research; no credentials, network, or broker.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {backtest} from './atlas-opening-bell.mjs';
function parseCsv(csv){
 const rows=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
 if(rows.length<2)throw Error("CSV is empty");
 const headers=rows.shift().split(",").map(x=>x.trim().toLowerCase());
 if(new Set(headers).size!==headers.length||!["timestamp","open","high","low","close"].every(x=>headers.includes(x)))throw Error("Expected timestamp,open,high,low,close headers");
 const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const days=new Map();
 let previous=-Infinity;
 for(const row of rows){
  const v=row.split(",").map(x=>x.trim()); if(v.length!==headers.length)throw Error("Malformed CSV row");
  const b=Object.fromEntries(headers.map((h,i)=>[h,v[i]]));
  const t=Date.parse(b.timestamp);
  if(!/(Z|[+-]\d\d:\d\d)$/.test(b.timestamp)||!Number.isFinite(t)||t<=previous||t%300000!==0)throw Error("Timestamps must be unique, chronological, timezone-qualified five-minute bar starts");
  previous=t;
  const p=Object.fromEntries(fmt.formatToParts(t).map(x=>[x.type,x.value]));
  const m=+p.hour*60 + +p.minute;
  if(m<570||m>=960)continue;
  const day=p.year+"-"+p.month+"-"+p.day;
  const bar={timestamp:new Date(t).toISOString()};
  for(const k of ["open","high","low","close"]){bar[k]=Number(b[k]);if(!b[k]||!Number.isFinite(bar[k])||bar[k]<=0)throw Error("Invalid price");}
  if(!days.has(day))days.set(day,[]);
  days.get(day).push(bar);
 }
 if(!days.size)throw Error("No regular session data");
 for(const [d,bars] of days)if(bars.length!==78)throw Error("Incomplete or early-close session "+d+"; explicitly remove verified early-close dates and disclose them");
 return [...days.values()];
}
function evaluate(sessions,{splitIndex,initialCash=10000,feeBps=2,slippageBps=5}={}){
 if(!Number.isInteger(splitIndex)||splitIndex<1||splitIndex>=sessions.length)throw Error("Specify a chronological split with data on both sides");
 const period=(bars,fee,slip)=>{
  const result=backtest(bars,{initialCash,feeBps:fee,slippageBps:slip});
  const entry=bars[0][0].open*(1+slip/10000), exit=bars.at(-1).at(-1).close*(1-slip/10000);
  const qty=Math.floor(initialCash/(entry*(1+fee/10000)));
  const finalCash=initialCash-qty*entry*(1+fee/10000)+qty*exit*(1-fee/10000);
  const {trades,equity,...metrics}=result;
  return {...metrics,start:bars[0][0].timestamp,end:bars.at(-1).at(-1).timestamp,sessions:bars.length,buyAndHoldReturn:finalCash/initialCash-1,excessReturn:result.netReturn-(finalCash/initialCash-1),grossProfit:trades.reduce((s,t)=>s+Math.max(t.pnl,0),0),grossLoss:trades.reduce((s,t)=>s+Math.max(-t.pnl,0),0)};
 };
 // Validate continuity and chronology across the split using the original engine.
 backtest(sessions,{initialCash,feeBps,slippageBps});
 const earlier=sessions.slice(0,splitIndex),later=sessions.slice(splitIndex);
 return {rules:"fixed EMA12 / ATR14 x2 / 0.5% target risk",splitIndex,earlier:period(earlier,feeBps,slippageBps),later:period(later,feeBps,slippageBps),laterDoubleFriction:period(later,feeBps*2,slippageBps*2),limitations:"No proof the later period is genuinely unseen; no calendar completeness check, dividends, FX or liquidity model. Benchmark is price-only. No live trading."};
}
function testRunner(){
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 const rows=["timestamp,open,high,low,close"];
 for(const d of [6,7])for(let i=0;i<78;i++){const p=i<14?100:101+(i-14)*0.05;rows.push([new Date(Date.UTC(2025,0,d,14,30)+i*300000).toISOString(),p,p+0.1,p-0.1,p].join(","));}
 const sessions=parseCsv(rows.join("\n"));
 assert(sessions.length===2,"two sessions");assert(sessions[0].length===78,"78 bars");
 const report=evaluate(sessions,{splitIndex:1});
 assert(report.earlier.sessions===1&&report.later.sessions===1,"chronological split");
 assert(report.later.initialCash===10000,"fresh test capital");
 assert(report.laterDoubleFriction.netReturn<=report.later.netReturn,"friction stress");
 assert(Number.isFinite(report.later.buyAndHoldReturn),"benchmark");
 let rejected=false;try{parseCsv(rows.slice(0,-1).join("\n"))}catch{rejected=true}assert(rejected,"incomplete session");
 rejected=false;try{parseCsv([...rows,rows.at(-1)].join("\n"))}catch{rejected=true}assert(rejected,"duplicate timestamp");
 rejected=false;try{evaluate(sessions,{splitIndex:2})}catch{rejected=true}assert(rejected,"empty test split");
 return "9 additional synthetic assertions passed";
}
export {parseCsv,evaluate};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv[2]==='--self-test')console.log(testRunner());else{if(!process.argv[2]||!process.argv[3])throw Error('Usage: node research/atlas-opening-bell-evaluate.mjs data.csv splitIndex');console.log(JSON.stringify(evaluate(parseCsv(readFileSync(process.argv[2],'utf8')),{splitIndex:Number(process.argv[3])}),null,2));}}
