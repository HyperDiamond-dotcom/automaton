// Historical ETF research, not a trading system. No credentials, broker API, or orders.
// Fetches public Yahoo Finance raw daily OHLC on demand. Third-party data unverified.
import { request } from 'node:https';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
export const SETTINGS=Object.freeze({
  startingUSD:5000,capitalFraction:0.35,riskFraction:0.005,
  stopAtrMultiple:2,stopAtrWindow:14,stopDrawdownPct:5,
  entryBps:5,exitBps:5,commissionPerSideUSD:0.50
});
export const TICKERS=['QQQ','SPY','IWM','GLD','TLT'];
export const WINDOWS=[
  {name:'2017–2022 development',from:'2017-01-03',to:'2022-12-30'},
  {name:'2023–2025 later sample',from:'2023-01-03',to:'2025-12-31'},
  {name:'2026 retrospective holdout',from:'2026-01-02',to:'2026-10-19'}
];
export function yahooUrl(ticker) {
  if(!TICKERS.includes(ticker))throw Error('Invalid pre-registered ticker');
  // Period 2015–2026-10-20. Data beyond 2026-10-19 intentionally excluded.
  return 'https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+
    '?period1=1420070400&period2=1792454400&interval=1d';
}
export async function download(url) {
  return new Promise((resolve,reject)=>{
    const req=request(url,{timeout:15000,headers:{'User-Agent':'Mozilla/5.0 (research only)','Accept':'application/json'}},r=>{
      if(r.statusCode!==200){r.resume();reject(Error('Data provider HTTP '+r.statusCode));return;}
      const chunks=[];let total=0;
      r.on('data',c=>{total+=c.length;if(total>5_000_000)r.destroy(Error('Dataset larger than 5MB'));else chunks.push(c);});
      r.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      r.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(Error('Data request timed out')));
    req.on('error',reject);req.end();
  });
}
export function extractYahoo(json,symbol) {
  const doc=JSON.parse(json).chart?.result?.[0],quote=doc?.indicators?.quote?.[0];
  if(!doc||!quote||!Array.isArray(doc.timestamp))throw Error('Invalid Yahoo chart response');
  const bars=[];
  for(let i=0;i<doc.timestamp.length;i++){
    const [open,high,low,close]=['open','high','low','close'].map(x=>quote[x]?.[i]);
    if(![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||
       low>open||high<open||low>close||high<close)continue;
    const day=new Date(doc.timestamp[i]*1000).toISOString().slice(0,10);
    if(day>'2026-10-19')continue;
    bars.push({day,open,high,low,close});
  }
  if(bars.length<1000)throw Error('Dataset too small');
  for(let i=1;i<bars.length;i++)if(bars[i].day<=bars[i-1].day)throw Error('Duplicate/unordered days');
  return {symbol,bars,sha256:createHash('sha256').update(json).digest('hex')};
}
export function analyse(bars){
  let oldHao=null,oldHac=null,streak=0;
  const sums=bars.map(x=>x.close);
  return bars.map((c,i)=>{
    const hac=(c.open+c.high+c.low+c.close)/4;
    const hao=oldHao===null?(c.open+c.close)/2:(oldHao+oldHac)/2;
    const side=hac>hao?1:hac<hao?-1:0;
    streak=side&&Math.sign(streak)===side?streak+side:side;
    oldHao=hao;oldHac=hac;
    let atr=null;
    if(i>=14){
      let total=0;
      for(let j=i-13;j<=i;j++) {
        const x=bars[j],p=bars[j-1];
        total+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));
      }
      atr=total/14;
    }
    const sma50=i>=49?sums.slice(i-49,i+1).reduce((a,b)=>a+b,0)/50:null;
    const high20=i>=20?Math.max(...bars.slice(i-20,i).map(x=>x.high)):null;
    const low10=i>=10?Math.min(...bars.slice(i-10,i).map(x=>x.low)):null;
    const yearReturn=i>=252?c.close/sums[i-252]-1:null;
    return {...c,atr,sma50,high20,low10,yearReturn,haStreak:streak};
  });
}
export function signal(type,b,holding,monthlyBoundary=true){
  if(type==='heikin'){
    return holding?(b.haStreak<=-2||b.close<b.sma50?'EXIT':'HOLD'):
      (b.sma50!==null&&b.haStreak>=2&&b.close>b.sma50?'ENTER':'HOLD');
  }
  if(type==='donchian'){
    return holding?(b.low10!==null&&b.close<b.low10?'EXIT':'HOLD'):
      (b.high20!==null&&b.close>b.high20?'ENTER':'HOLD');
  }
  if(type==='momentum'){
    if(!monthlyBoundary||b.yearReturn===null)return 'HOLD';
    return holding?(b.yearReturn<0?'EXIT':'HOLD'):(b.yearReturn>0?'ENTER':'HOLD');
  }
  throw Error('Unknown strategy');
}
const f=SETTINGS;
function buyFill(price){return price*(1+f.entryBps/10000);}
function sellFill(price){return price*(1-f.exitBps/10000);}
function value(cash,held,b){return cash+(held?held.qty*b.close:0);}
export function backtest(analysed,type,window){
  if(!['heikin','donchian','momentum'].includes(type))throw Error('Unknown strategy');
  let equity=f.startingUSD,cash=equity,held=null,peak=equity,maxDd=0,
    blocked=0,halted=false,pending='HOLD';
  const trades=[],snapshots=[];let last=null;
  const sell=(b,raw,why)=>{
    const filled=sellFill(raw);
    cash+=held.qty*filled-f.commissionPerSideUSD;
    trades.push({entryDay:held.entryDay,exitDay:b.day,qty:held.qty,
      pnlUSD:Number(((filled-held.fill)*held.qty-2*f.commissionPerSideUSD).toFixed(2)),reason:why});
    held=null;
  };
  for(let i=0;i<analysed.length;i++){
    const b=analysed[i];
    if(b.day<window.from)continue;
    if(b.day>window.to)break;
    last=b;
    if(pending==='EXIT'&&held)sell(b,b.open,'SIGNAL');
    if(pending==='ENTER'&&!held&&!halted) {
      const yesterday=analysed[i-1];
      if(!yesterday?.atr||yesterday.atr<=0){blocked++;}
      else {
        const buy=buyFill(b.open);
        const distance=f.stopAtrMultiple*yesterday.atr;
        const budget=f.startingUSD*f.riskFraction; // fixed, never increases after gains
        const riskPerShare=distance+(buy-b.open)+(b.open-sellFill(b.open));
        const maxByRisk=Math.max(0,(budget-2*f.commissionPerSideUSD)/riskPerShare);
        const maxByCapital=Math.max(0,(equity*f.capitalFraction-f.commissionPerSideUSD)/buy);
        const qty=Math.floor(Math.min(maxByRisk,maxByCapital)*1000)/1000;
        if(qty<=0){blocked++;}
        else {
          cash-=qty*buy+f.commissionPerSideUSD;
          held={entryDay:b.day,fill:buy,qty,stop:buy-distance};
        }
      }
    }
    pending='HOLD';
    if(held&&b.low<=held.stop) {
      const fillAt=Math.min(b.open,held.stop);
      sell(b,fillAt,'ATR_STOP');
    }
    const mark=value(cash,held,b);
    peak=Math.max(peak,mark);
    maxDd=Math.max(maxDd,(peak-mark)/peak);
    snapshots.push({day:b.day,mark});
    if(mark<peak*(1-f.stopDrawdownPct/100)) {
      halted=true;
      if(held)sell(b,b.close,'DRAWDOWN_HALT');
    }
    if(!halted){
      const next=analysed[i+1],monthEnd=!next||next.day.slice(0,7)!==b.day.slice(0,7);
      pending=signal(type,b,Boolean(held),monthEnd);
      if(held&&b.atr)held.stop=Math.max(held.stop,b.close-f.stopAtrMultiple*b.atr);
    }
  }
  if(held&&last)sell(last,last.close,'END_OF_PERIOD');
  equity=cash;
  const win=trades.filter(t=>t.pnlUSD>0).length;
  return {ticker:window.ticker,period:window.name,strategy:type,trades:trades.length,win,
    netUSD:Number((cash-f.startingUSD).toFixed(2)),
    returnPct:Number(((cash/f.startingUSD-1)*100).toFixed(3)),
    maxMarkDrawdownPct:Number((maxDd*100).toFixed(3)),
    halted,blocked,allTrades:trades};
}
export function passive(bars,window){
  const first=bars.find(b=>b.day>=window.from),last=[...bars].reverse().find(b=>b.day<=window.to);
  if(!first||!last)throw Error('Missing window');
  const buy=buyFill(first.open),shares=Math.floor((f.startingUSD*f.capitalFraction-f.commissionPerSideUSD)/buy*1000)/1000;
  const remaining=f.startingUSD-shares*buy-f.commissionPerSideUSD;
  let peak=f.startingUSD,maxDD=0;
  for(const b of bars){
    if(b.day<window.from||b.day>window.to)continue;
    const mark=remaining+shares*b.close;
    peak=Math.max(peak,mark);
    maxDD=Math.max(maxDD,(peak-mark)/peak);
  }
  const final=remaining+shares*sellFill(last.close)-f.commissionPerSideUSD;
  maxDD=Math.max(maxDD,(peak-final)/peak);
  return {ticker:window.ticker,period:window.name,strategy:'passive-35%-allocation',
    netUSD:Number((final-f.startingUSD).toFixed(2)),
    maxMarkDrawdownPct:Number((maxDD*100).toFixed(3)),
    returnPct:Number(((final/f.startingUSD-1)*100).toFixed(3))};
}
export async function run(out='research-etf-results.json'){
  const metadata=[],results=[],benchmarks=[];
  for(const ticker of TICKERS){
    const content=await download(yahooUrl(ticker));
    const {bars,sha256}=extractYahoo(content,ticker),ready=analyse(bars);
    metadata.push({ticker,sha256,first:bars[0].day,last:bars.at(-1).day,bars:bars.length,
      source:'Yahoo Finance chart raw OHLC, independent licensing/provenance not verified'});
    for(const w of WINDOWS){
      const ww={...w,ticker};
      for(const type of ['heikin','donchian','momentum'])
        results.push(backtest(ready,type,ww));
      benchmarks.push(passive(bars,ww));
    }
  }
  const doc={rules:f,metadata,results,benchmarks,disclaimers:[
    'Fixed-size research; data not exchange certified, availability subject to provider terms',
    'No dividends, financing income, taxes, FX, corporate actions, broker liquidity or real fills',
    'Long-only US ETFs, independent allocation per ticker rather than actual combined portfolio',
    'Risk sizing uses fractional shares; simulated trades only; no predictive claims',
    '2017–2022, 2023–2025 and 2026 all retrospective; the 2026 sample is a holdout only relative to predeclared parameters, not prospective live data'
  ]};
  await writeFile(out,JSON.stringify(doc,null,2));
  console.log(JSON.stringify({metadata,summary:results.map(({ticker,period,strategy,trades,netUSD,returnPct,maxMarkDrawdownPct,halted,blocked})=>
    ({ticker,period,strategy,trades,netUSD,returnPct,maxMarkDrawdownPct,halted,blocked})),benchmarks},null,2));
  return doc;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
  run(process.argv[2]).catch(e=>{console.error('ETF_STUDY_FAILED:',e.message);process.exitCode=1;});
