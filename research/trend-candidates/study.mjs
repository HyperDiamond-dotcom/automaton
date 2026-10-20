/**
 * Research only. No exchange, brokerage or funded-account integration.
 * Head-to-head: Heikin-Ashi (signal only), 20/10 Donchian and 63-session momentum.
 * All entry/exit fills use REAL unadjusted NQ bars with hypothetical MNQ economics.
 */
import fs from 'node:fs';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const RULES=Object.freeze({
  microUsdPerPoint:2, feeUsdPerSide:1.50, slippagePtsPerSide:0.25,
  initialEquityUSD:25000, maxDrawdownFraction:0.05, atrWindow:14, atrMultiple:2,
  haConfirm:2, smaWindow:20, donchianEntry:20, donchianExit:10, momentumWindow:63
});
const n=x=>Number(x);
const finite=x=>Number.isFinite(x);
export function candleFromCsv(line,header){
  const x=line.trim().split(',');
  const find=key=>x[header.indexOf(key)];
  const dt=find('datetime')||'';
  const m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})([+-]\d{2}:?\d{2})$/.exec(dt);
  if(!m)throw Error('Bad timestamp (timezone offset required): '+dt);
  const [open,high,low,close]=['open','high','low','close'].map(v=>n(find(v)));
  if(![open,high,low,close].every(v=>finite(v)&&v>0)||
     low>Math.min(open,close)||high<Math.max(open,close)||high<low)throw Error('Invalid OHLC '+dt);
  return {day:m[1],min:n(m[2])*60+n(m[3]),open,high,low,close};
}
export function collectRthDaily(minuteBars){
  const days=[],byDay=new Map();
  for(const b of minuteBars){
    if(b.min<570||b.min>=960)continue;
    if(!byDay.has(b.day))byDay.set(b.day,[]);
    byDay.get(b.day).push(b);
  }
  let skipped=0;
  for(const [day,rows] of byDay){
    rows.sort((a,b)=>a.min-b.min);
    // Reject incomplete, gapped or early-close days instead of fabricating history.
    if(rows.length!==390||rows[0].min!==570||rows.at(-1).min!==959||
       rows.some((v,i)=>v.min!==570+i)){skipped++;continue;}
    days.push({day,open:rows[0].open,close:rows.at(-1).close,
      high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low))});
  }
  days.sort((a,b)=>a.day.localeCompare(b.day));
  for(let i=1;i<days.length;i++)if(days[i].day===days[i-1].day)throw Error('Duplicate trading day');
  return {days,skippedIncompleteRthDays:skipped};
}
export async function loadFromCsvFiles(files){
  const bars=[],sources=[];
  for(const name of files){
    const hasher=createHash('sha256');
    let header=null,oldDay=null,minuteBars=[],skipped=0,valid=[];
    const source=fs.createReadStream(name);
    const input=createInterface({input:source,crlfDelay:Infinity});
    for await(const line of input){
      hasher.update(line+'\n');
      if(!line.trim())continue;
      if(!header){
        header=line.replace(/\r$/,'').split(',').map(s=>s.trim().toLowerCase());
        if(!['datetime','open','high','low','close'].every(x=>header.includes(x)))throw Error('Missing CSV columns');
        continue;
      }
      const bar=candleFromCsv(line,header);
      if(bar.min<570||bar.min>=960)continue;
      if(oldDay!==null&&bar.day!==oldDay){
        const d=collectRthDaily(minuteBars);
        valid.push(...d.days);skipped+=d.skippedIncompleteRthDays;
        minuteBars=[];
      }
      minuteBars.push(bar);oldDay=bar.day;
    }
    if(minuteBars.length){
      const d=collectRthDaily(minuteBars);
      valid.push(...d.days);skipped+=d.skippedIncompleteRthDays;
    }
    bars.push(...valid);
    sources.push({file:path.basename(name),sha256:hasher.digest('hex'),
      completeDays:valid.length,skippedIncompleteDays:skipped});
  }
  bars.sort((a,b)=>a.day.localeCompare(b.day));
  for(let i=1;i<bars.length;i++)if(bars[i].day===bars[i-1].day)throw Error('Duplicate RTH day across files');
  if(bars.length<120)throw Error('Need at least 120 complete RTH days');
  return {days:bars,sources};
}
export function indicators(days){
  let haOpen=null,haClose=null,streak=0;
  return days.map((b,i)=>{
    const newClose=(b.open+b.high+b.low+b.close)/4;
    const newOpen=haOpen===null?(b.open+b.close)/2:(haOpen+haClose)/2;
    const color=newClose>newOpen?1:newClose<newOpen?-1:0;
    streak=color!==0&&Math.sign(streak)===color?streak+color:color;
    haOpen=newOpen;haClose=newClose;
    const closes=days.slice(Math.max(0,i-19),i+1).map(x=>x.close);
    const sma=closes.length===20?closes.reduce((a,c)=>a+c,0)/20:null;
    let atr=null;
    if(i>=14){
      let sum=0;
      for(let j=i-13;j<=i;j++){
        const v=days[j],p=days[j-1];
        sum+=Math.max(v.high-v.low,Math.abs(v.high-p.close),Math.abs(v.low-p.close));
      }
      atr=sum/14;
    }
    const high20=i>=20?Math.max(...days.slice(i-20,i).map(x=>x.high)):null;
    const low10=i>=10?Math.min(...days.slice(i-10,i).map(x=>x.low)):null;
    const mom63=i>=63?b.close/days[i-63].close-1:null;
    return {...b,haOpen:newOpen,haClose:newClose,haStreak:streak,sma20:sma,atr14:atr,
      high20,low10,mom63};
  });
}
export function decision(type,bar,holding){
  if(type==='heikin-ashi'){
    if(!holding)return bar.sma20!==null&&bar.haStreak>=2&&bar.close>bar.sma20?'ENTER':'NONE';
    return bar.haStreak<=-2||bar.close<bar.sma20?'EXIT':'NONE';
  }
  if(type==='donchian'){
    if(!holding)return bar.high20!==null&&bar.close>bar.high20?'ENTER':'NONE';
    return bar.low10!==null&&bar.close<bar.low10?'EXIT':'NONE';
  }
  if(type==='momentum'){
    if(bar.mom63===null)return 'NONE';
    if(!holding)return bar.mom63>0?'ENTER':'NONE';
    return bar.mom63<0?'EXIT':'NONE';
  }
  throw Error('Unknown strategy');
}
function cost(){return RULES.feeUsdPerSide+RULES.slippagePtsPerSide*RULES.microUsdPerPoint;}
export function replay(days,{type,from,to}){
  if(!['heikin-ashi','donchian','momentum'].includes(type))throw Error('Unknown strategy');
  const rows=indicators(days),start=rows.findIndex(b=>b.day>=from);
  if(start<1||!rows.some(b=>b.day>=from&&b.day<=to))throw Error('No usable period');
  let cash=RULES.initialEquityUSD,position=null,peak=cash,maxDD=0,halted=false;
  const fills=[],trades=[],drawdown=[];
  let pending=null,stop=null,last=null;
  const sell=(date,price,reason)=>{
    if(!position)throw Error('Cannot exit empty position');
    const exit=price-RULES.slippagePtsPerSide;
    const net=(exit-position.entry)*RULES.microUsdPerPoint-
       2*RULES.feeUsdPerSide;
    cash+=net;
    fills.push({day:date,side:'SELL',price:exit,reason,fee:RULES.feeUsdPerSide});
    trades.push({entryDay:position.day,exitDay:date,netUSD:Number(net.toFixed(2)),reason});
    position=null;stop=null;pending=null;
  };
  for(let i=start;i<rows.length;i++){
    const b=rows[i];
    if(b.day>to)break;
    last=b;
    if(pending==='EXIT'&&position){sell(b.day,b.open,'PRIOR_DAY_EXIT');}
    else if(pending==='ENTER'&&!position&&!halted){
      const entry=b.open+RULES.slippagePtsPerSide;
      position={entry,day:b.day};
      stop=b.atr14&&b.atr14>0?entry-RULES.atrMultiple*b.atr14:null;
      fills.push({day:b.day,side:'BUY',price:entry,reason:'PRIOR_DAY_ENTRY',fee:RULES.feeUsdPerSide});
    }
    pending=null;
    if(position&&stop!==null&&b.low<=stop){
      sell(b.day,Math.min(b.open,stop),'ATR_STOP');
    }
    const marked=cash+(position?(b.close-position.entry)*RULES.microUsdPerPoint-
      2*RULES.feeUsdPerSide:0);
    peak=Math.max(peak,marked);
    const dd=(peak-marked)/peak;maxDD=Math.max(maxDD,dd);
    drawdown.push({day:b.day,markedUSD:Number(marked.toFixed(2))});
    if(dd>=RULES.maxDrawdownFraction&&!halted){
      halted=true;
      if(position)sell(b.day,b.close,'DRAWDOWN_HALT_CLOSE');
    }
    if(!halted){
      pending=decision(type,b,Boolean(position));
      if(position&&b.atr14!==null&&b.atr14>0)
        stop=Math.max(stop??-Infinity,b.close-RULES.atrMultiple*b.atr14);
    }
  }
  if(position&&last)sell(last.day,last.close,'END_OF_SAMPLE');
  const n=trades.length,wins=trades.filter(t=>t.netUSD>0).length;
  return {strategy:type,window:{from,to},initialUSD:RULES.initialEquityUSD,
    finalUSD:Number(cash.toFixed(2)),netUSD:Number((cash-RULES.initialEquityUSD).toFixed(2)),
    returnPct:Number(((cash/RULES.initialEquityUSD-1)*100).toFixed(3)),
    trades:n,wins,winRatePct:n?Number((wins/n*100).toFixed(1)):null,
    feesUSD:Number((fills.length*RULES.feeUsdPerSide).toFixed(2)),
    maxMarkedDrawdownPct:Number((maxDD*100).toFixed(3)),halted,
    fills,tradesDetail:trades,
    disclaimer:'Educational backtest; RTH NQ unadjusted stitched front month (roll jumps); simulated one MNQ contract. Synthetic HA prices are NEVER used as fills. No tick spreads, financing, interest, margin calls, roll trading, overnight stop fills or true exchange data validation.'};
}
export function benchmark(days,from,to){
  const a=days.find(x=>x.day>=from),b=[...days].reverse().find(x=>x.day<=to);
  if(!a||!b)throw Error('Missing benchmark window');
  const pnl=(b.close-a.open-2*RULES.slippagePtsPerSide)*RULES.microUsdPerPoint-
   2*RULES.feeUsdPerSide;
  return {name:'one-MNQ passive long RTH-open to last RTH-close (roll caveat)',
    netUSD:Number(pnl.toFixed(2)),returnPct:Number((pnl/RULES.initialEquityUSD*100).toFixed(3))};
}
export async function run(files,outfile){
  const {days,sources}=await loadFromCsvFiles(files);
  const windows=[{name:'2025 development',from:'2025-01-02',to:'2025-12-31'},
    {name:'2026 later sample',from:'2026-01-01',to:'2026-10-08'}];
  const tests=[];
  for(const w of windows)for(const type of ['heikin-ashi','donchian','momentum'])
    tests.push({...replay(days,{...w,type}),period:w.name});
  const report={sources,fullDays:days.length,first:days[0].day,last:days.at(-1).day,
    rules:RULES,benchmark:windows.map(w=>({...w,...benchmark(days,w.from,w.to)})),
    results:tests,cautions:['Only two market periods and a single futures market; not generalisable',
    'Earlier test in 2025 and later retrospective 2026, not forward testing',
    'NQ data are unadjusted across rolls; one-contract MNQ assumed not independently verified',
    'Risk limits are theoretical and cannot prevent gaps or worse-than-stop fills']};
  if(outfile)await writeFile(outfile,JSON.stringify(report,null,2));
  const view={sources,fullDays:days.length,
    tests:tests.map(x=>({period:x.period,strategy:x.strategy,trades:x.trades,winRatePct:x.winRatePct,
      netUSD:x.netUSD,returnPct:x.returnPct,maxMarkedDrawdownPct:x.maxMarkedDrawdownPct,halted:x.halted,feesUSD:x.feesUSD})),
    benchmark:report.benchmark};
  console.log(JSON.stringify(view,null,2));
  return view;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  if(process.argv.length<5) {console.error('Usage: node study.mjs 2024.csv 2025.csv 2026.csv [report.json]');process.exitCode=2;}
  else run(process.argv.slice(2,5),process.argv[5]).catch(e=>{console.error('STUDY_FAILED',e.message);process.exitCode=1;});
}
