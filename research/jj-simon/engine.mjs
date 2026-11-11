// RESEARCH-ONLY one-minute NQ/MNQ replay. No broker, credentials or order APIs.
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const MONEY_PER_POINT=2; // one MNQ micro contract, NOT NQ ($20 per point)
const FEE_PER_SIDE=1.50; // USD assumed: commission+exchange fees (scenario, not quoted broker price)
const SLIP_POINTS=0.25; // one tick each side
export const SETTINGS=Object.freeze({
  initialEquity:25000, riskFraction:0.005, sessionLossFraction:0.01,
  accountDrawdownFraction:0.05, maxContracts:1, maxSessionTrades:4,
  atrPeriod:14, atrMultiplier:1.25, targetR:1.5, minimumReversionR:0.75,
  continuationMinutes:15
});
function finite(x){return Number.isFinite(x);}
export function parseBar(line, columns){
  const parts=line.replace(/\r$/,'').split(',');
  const find=n=>parts[columns.indexOf(n)];
  const original=String(find('datetime')||'').trim();
  const match=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})([+-]\d{2}:?\d{2})$/.exec(original);
  if(!match)throw Error('Data must contain New York local timestamps with explicit offsets: '+original);
  const iso=match[1]+'T'+match[2]+':'+match[3]+':'+match[4]+match[5].replace(/^([+-]\d{2})(\d{2})$/,'$1:$2');
  const time=Date.parse(iso),[open,high,low,close]=['open','high','low','close'].map(n=>Number(find(n)));
  if(!finite(time)||![open,high,low,close].every(x=>finite(x)&&x>0)||
     low>high||low>open||low>close||high<open||high<close)throw Error('Invalid OHLC row: '+original);
  return {time,day:match[1],minute:Number(match[2])*60+Number(match[3]),open,high,low,close,datetime:iso};
}
export async function readBars(filename){
  const stream=createInterface({input:createReadStream(filename),crlfDelay:Infinity});
  let columns, bars=[],previous=-Infinity, count=0;
  for await(const line of stream){
    if(!line.trim())continue;
    if(!columns){
      columns=line.trim().split(',').map(s=>s.trim().toLowerCase());
      if(!['datetime','open','high','low','close'].every(x=>columns.includes(x)))throw Error('Missing required CSV columns');
      continue;
    }
    const bar=parseBar(line,columns);count++;
    if(bar.time<=previous)throw Error('Duplicate or unordered candle at row '+count);
    previous=bar.time;
    bars.push(bar);
    if(count>900000)throw Error('Unreasonably large dataset (>900k candles)');
  }
  if(count<100)throw Error('At least 100 real candles are required');
  return bars;
}
export function atr(bars,i,n=14){
  if(i<n)return null;
  let total=0;
  for(let j=i-n+1;j<=i;j++){
    const c=bars[j],p=bars[j-1];
    if(c.time-p.time!==60000)return null;
    total+=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));
  }
  return total/n;
}
export function qualifies(bars,i,side){
  // Both a confirmed market structure break AND displacement are required, no future bars.
  if(i<7)return false;
  const bar=bars[i],prev=bars[i-1];
  const prior=bars.slice(i-5,i);
  if(prior.some((b,j)=>j&&b.time-prior[j-1].time!==60000)||
     bar.time-prev.time!==60000)return false;
  const body=Math.abs(bar.close-bar.open),previousBody=Math.abs(prev.close-prev.open);
  const breakout=side===1?bar.close>Math.max(...prior.map(x=>x.high)):
    bar.close<Math.min(...prior.map(x=>x.low));
  const displacement=side===1?
    bar.close>bar.open&&prev.close<prev.open&&bar.close>prev.high:
    bar.close<bar.open&&prev.close>prev.open&&bar.close<prev.low;
  return breakout&&displacement&&body>previousBody;
}
function closePosition(openTrade,candle,force=false){
  const {dir,stop,target,entry}=openTrade;
  let price,exitReason;
  if(force){price=candle.close;exitReason='SESSION_END';}
  else {
    const hitStop=dir===1?candle.low<=stop:candle.high>=stop;
    const hitTarget=dir===1?candle.high>=target:candle.low<=target;
    if(hitStop){
      // Conservative: same-candle stop+target -> stop first; adverse gaps fill at open.
      price=dir===1?Math.min(candle.open,stop):Math.max(candle.open,stop);
      exitReason='STOP';
    } else if(hitTarget){
      // Do not award favourable gaps above take-profit.
      price=target;exitReason='TARGET';
    } else return null;
  }
  const exitFill=price-dir*SLIP_POINTS;
  const pnl=(exitFill-entry)*dir*MONEY_PER_POINT-2*FEE_PER_SIDE;
  return {pnl:Number(pnl.toFixed(2)),exit:exitFill,exitReason,exitTime:candle.datetime};
}
export function runReplay(bars,{strategy='continuation',from='2026-01-01',to='2026-12-31',settings=SETTINGS}={}){
  if(!['continuation','reversion'].includes(strategy))throw Error('Unknown strategy');
  if(!Array.isArray(bars)||bars.length<100)throw Error('Insufficient candles');
  const days=new Map();
  for(const bar of bars){if(!days.has(bar.day))days.set(bar.day,[]);days.get(bar.day).push(bar);}
  const initial=settings.initialEquity;let equity=initial,peak=initial,maxDrawdown=0,sessionCount=0,signals=0,eligible=0,blocked=0;
  const trades=[], sessionStats=[];
  let globallyHalted=false;
  for(const [day,daily] of days){
    if(day<from||day>to)continue;
    let dayStart=equity,dayPnl=0;
    for(const [start,end] of [[570,660],[840,900]]){
      const startIndex=daily.findIndex(x=>x.minute===start);
      if(startIndex<0)continue;sessionCount++;
      const anchor=daily[startIndex].open;
      let openTrade=null, sessionTrades=0,reversionLosses=0;
      for(let i=startIndex+1;i<daily.length;i++){
        const candle=daily[i];
        if(candle.minute>=end)break;
        const prev=daily[i-1];
        if(candle.time-prev.time!==60000){
          // Market data gap: do not manufacture fills across unknown bars. Mark the session unusable.
          if(openTrade){openTrade=null;blocked++;globallyHalted=true;}
          break;
        }
        if(openTrade){
          const closed=closePosition(openTrade,candle);
          if(closed){
            const trade={...openTrade,...closed};
            trades.push(trade);equity+=closed.pnl;dayPnl+=closed.pnl;
            peak=Math.max(peak,equity);
            maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
            if(strategy==='reversion')reversionLosses=closed.pnl<0?reversionLosses+1:0;
            if(equity<=initial*(1-settings.accountDrawdownFraction))globallyHalted=true;
            openTrade=null;
            // No new trade on an exit candle.
            continue;
          }
        }
        if(openTrade||globallyHalted||dayPnl<=-dayStart*settings.sessionLossFraction||
           sessionTrades>=settings.maxSessionTrades||
           strategy==='reversion'&&reversionLosses>=3)continue;
        const elapsed=prev.minute-start;
        if(strategy==='continuation'?(elapsed<0||elapsed>=settings.continuationMinutes):
           (elapsed<settings.continuationMinutes||elapsed>=end-start))continue;
        const volatility=atr(daily,i-1,settings.atrPeriod);
        if(!volatility||volatility<=0)continue;
        const side=prev.close>anchor?1:prev.close<anchor?-1:0;
        if(!side)continue;
        const dir=strategy==='continuation'?side:-side;
        if(!qualifies(daily,i-1,dir))continue;
        signals++;
        const stopDistance=Math.max(2,settings.atrMultiplier*volatility);
        const entry=candle.open+dir*SLIP_POINTS;
        const stop=entry-dir*stopDistance;
        let reward=stopDistance*settings.targetR;
        if(strategy==='reversion'){
          if(Math.abs(prev.close-anchor)<volatility)continue;
          const toward=(anchor-entry)*dir;
          if(toward<settings.minimumReversionR*stopDistance)continue;
          reward=Math.min(reward,toward);
        }
        // Fixed 1 micro contract, with risk budget including slippage and estimated roundtrip fees.
        const estimatedRisk=(stopDistance+2*SLIP_POINTS)*MONEY_PER_POINT+2*FEE_PER_SIDE;
        if(estimatedRisk>equity*settings.riskFraction){blocked++;continue;}
        const target=entry+dir*reward;
        openTrade={day,session:start===570?'NY_OPEN':'NY_AFTERNOON',strategy,dir,anchor,
          entry,stop,target,atr:volatility,entryTime:candle.datetime,riskUSD:estimatedRisk};
        sessionTrades++;eligible++;
        // Apply stop/target to the entry bar conservatively. Do not inspect future beyond it.
        const sameBar=closePosition(openTrade,candle);
        if(sameBar){
          trades.push({...openTrade,...sameBar});
          equity+=sameBar.pnl;dayPnl+=sameBar.pnl;
          peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
          if(strategy==='reversion')reversionLosses=sameBar.pnl<0?reversionLosses+1:0;
          if(equity<=initial*(1-settings.accountDrawdownFraction))globallyHalted=true;
          openTrade=null;
        }
      }
      if(openTrade){
        const last=[...daily].reverse().find(x=>x.minute>=start&&x.minute<end);
        if(last){
          const closed=closePosition(openTrade,last,true);
          trades.push({...openTrade,...closed});equity+=closed.pnl;dayPnl+=closed.pnl;
          peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
          if(equity<=initial*(1-settings.accountDrawdownFraction))globallyHalted=true;
        }
      }
    }
    sessionStats.push({day,pnlUSD:Number(dayPnl.toFixed(2))});
  }
  const wins=trades.filter(t=>t.pnl>0);
  const sum=trades.reduce((n,t)=>n+t.pnl,0);
  return {strategy,from,to,instrument:'NQ 1-minute candles; MNQ 1-contract hypothetical economics',startingUSD:initial,endingUSD:Number(equity.toFixed(2)),
    netPnLUSD:Number(sum.toFixed(2)),returnPct:Number((sum/initial*100).toFixed(3)),
    trades:trades.length,winners:wins.length,winRatePct:trades.length?Number((wins.length/trades.length*100).toFixed(1)):null,
    averagePnLUSD:trades.length?Number((sum/trades.length).toFixed(2)):null,
    maxRealizedDrawdownPct:Number((maxDrawdown*100).toFixed(3)),
    sessionsObserved:sessionCount,signals,entries:eligible,riskBlocked:blocked,
    totalModelledFeesUSD:Number((trades.length*FEE_PER_SIDE*2).toFixed(2)),
    slippagePerSidePoints:SLIP_POINTS,feePerSideUSD:FEE_PER_SIDE,
    halted:globallyHalted,tradesDetail:trades,sessionStats,
    limitations:'Retrospective NQ stitched/rolled third-party one-minute candles; no tick-level fills, book, spread, market impact, funding fees or independent vendor validation. Conservative stop-first for same candle. Net realized results, no intratrade drawdown. No news filter. Never submit orders.'};
}
export async function main(csv,out){
  const bars=await readBars(csv);
  const report={dataset:{sourceFile:path.basename(csv),bars:bars.length,first:bars[0].datetime,last:bars.at(-1).datetime,disclaimer:'Third-party stitched NQ bars; provenance and roll effects require independent audit.'},
    config:SETTINGS,analyses:[]};
  for(const strategy of ['continuation','reversion']){
    for(const [label,from,to] of [['development','2026-01-01','2026-06-30'],['holdout','2026-07-01','2026-10-08']]){
      report.analyses.push({window:label,...runReplay(bars,{strategy,from,to})});
    }
  }
  if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');
  const summary={dataset:report.dataset,results:report.analyses.map(({window,strategy,trades,winRatePct,netPnLUSD,returnPct,maxRealizedDrawdownPct,signals,riskBlocked,halted})=>
    ({window,strategy,trades,winRatePct,netPnLUSD,returnPct,maxRealizedDrawdownPct,signals,riskBlocked,halted}))};
  console.log(JSON.stringify(summary,null,2));
  return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  if(!process.argv[2]){console.error('Usage: node engine.mjs /path/to/NQ.csv [report.json]');process.exitCode=2;}
  else main(process.argv[2],process.argv[3]).catch(e=>{console.error('BACKTEST_FAILED '+e.message);process.exitCode=1;});
}
