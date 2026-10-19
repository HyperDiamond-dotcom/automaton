import fs from 'node:fs';
import path from 'node:path';

// ATLAS CRYPTO: paper simulation only; never connects to private exchange APIs.
const API = 'https://api.exchange.coinbase.com';
export const SYMBOLS = Object.freeze(['BTC-USD', 'ETH-USD']);
export const CFG = Object.freeze({
  cash: 5000, intervalMs: 900000, fee: 0.006, slippage: 0.001,
  maxTrade: 0.10, maxExposure: 0.20, stop: 0.03, take: 0.06,
  maxDrawdown: 0.05, maxSpread: 0.005, maxQuoteAge: 120000,
});

export function initialState(cash = CFG.cash) {
  if (!Number.isFinite(cash) || cash <= 0) throw Error('Bad cash balance');
  return {mode:'PAPER',version:1,initialCash:cash,cash,peakEquity:cash,
    halted:false,haltReason:null,positions:{},processed:{},fills:[],lastRun:null};
}
export function validate(s) {
  if (!s || s.mode!=='PAPER' || s.version!==1 || !Number.isFinite(s.cash) ||
      s.cash < 0 || !Number.isFinite(s.peakEquity) || s.peakEquity <= 0 ||
      !s.positions || !s.processed || !Array.isArray(s.fills)) throw Error('Corrupt paper state: refuse to run');
  for (const [sym,p] of Object.entries(s.positions))
    if (!SYMBOLS.includes(sym) || !Number.isFinite(p.qty) || p.qty <= 0 ||
        !Number.isFinite(p.entry) || p.entry <= 0) throw Error('Invalid paper position');
  return s;
}
export function sma(prices,n) {
  if (prices.length<n || !prices.slice(-n).every(v=>Number.isFinite(v)&&v>0)) return null;
  return prices.slice(-n).reduce((a,b)=>a+b,0)/n;
}
export function signal(bars) {
  if (bars.length < 51) return 'WAIT';
  const prices=bars.map(x=>x.close);
  const old=prices.slice(0,-1);
  const a=sma(old,20), b=sma(old,50), c=sma(prices,20), d=sma(prices,50);
  if ([a,b,c,d].some(v=>v===null)) return 'WAIT';
  if (a<=b&&c>d) return 'BUY';
  if (a>=b&&c<d) return 'SELL';
  return 'HOLD';
}
export function candles(raw, now=Date.now()) {
  if (!Array.isArray(raw)) throw Error('Bad market candles');
  const dedup=new Map();
  for (const row of raw) {
    if (!Array.isArray(row)||row.length<5) continue;
    const [time,low,high,open,close]=row.map(Number);
    if (!Number.isInteger(time) || time*1000 > now-900000 ||
        ![low,high,open,close].every(v=>Number.isFinite(v)&&v>0) ||
        low>high || low>Math.min(open,close) || high<Math.max(open,close)) continue;
    dedup.set(time,{time,close});
  }
  const bars=[...dedup.values()].sort((a,b)=>a.time-b.time);
  if (bars.length<52 || now/1000-bars.at(-1).time>1980) return [];
  for (let i=bars.length-51;i<bars.length;i++)
    if (bars[i].time-bars[i-1].time!==900) return [];
  return bars;
}
export function quote(raw,now=Date.now()) {
  const price=Number(raw?.price), bid=Number(raw?.bid), ask=Number(raw?.ask);
  const time=Date.parse(raw?.time||'');
  if (![price,bid,ask,time].every(Number.isFinite) || bid<=0 || ask<bid ||
      time>now+10000 || now-time>CFG.maxQuoteAge ||
      price<bid*0.98 || price>ask*1.02 ||
      (ask-bid)/((ask+bid)/2)>CFG.maxSpread)
    throw Error('Missing/stale/wide-spread quote');
  return {price,bid,ask,time:raw.time};
}
export function equity(s,marks) {
  let result=s.cash;
  for (const [sym,p] of Object.entries(s.positions)) {
    if (!Number.isFinite(marks[sym])||marks[sym]<=0) throw Error('Missing market mark: '+sym);
    result+=p.qty*marks[sym]*(1-CFG.fee-CFG.slippage);
  }
  return result;
}
export function buy(s,sym,q,when,why='SMA_UP') {
  if (!SYMBOLS.includes(sym)||s.halted||s.positions[sym]) return false;
  const marks=Object.fromEntries(Object.entries(s.positions).map(([k,p])=>[k,p.mark]));
  const eq=equity(s,marks);
  const gross=Object.values(s.positions).reduce((a,p)=>a+p.qty*p.mark,0);
  const spend=Math.min(s.cash,eq*CFG.maxTrade,Math.max(0,eq*CFG.maxExposure-gross));
  if (spend<5) return false;
  const px=q.ask*(1+CFG.slippage), qty=spend/(px*(1+CFG.fee));
  const fee=qty*px*CFG.fee;
  s.cash=Math.max(0,s.cash-qty*px-fee);
  s.positions[sym]={qty,entry:px,mark:q.price,at:when};
  s.fills.push({when,symbol:sym,side:'BUY',qty,price:px,fee,reason:why,simulated:true});
  return true;
}
export function sell(s,sym,q,when,why) {
  const p=s.positions[sym];
  if (!p) return false;
  const px=q.bid*(1-CFG.slippage), fee=p.qty*px*CFG.fee;
  s.cash+=p.qty*px-fee;
  delete s.positions[sym];
  s.fills.push({when,symbol:sym,side:'SELL',qty:p.qty,price:px,fee,reason:why,simulated:true});
  return true;
}
export function evaluate(s,market,now=Date.now()) {
  validate(s);
  const marks={};
  // Validate all feeds before modifying the portfolio.
  for (const sym of SYMBOLS) {
    const m=market[sym];
    if (!m||!Array.isArray(m.bars)||m.bars.length<52 || !m.q)
      throw Error('Incomplete data for '+sym);
    quote(m.q,now);
    if (now/1000-m.bars.at(-1).time>1980) throw Error('Stale candles: '+sym);
    marks[sym]=m.q.price;
  }
  for (const [sym,p] of Object.entries(s.positions)) p.mark=marks[sym];
  const eq=equity(s,marks);
  s.peakEquity=Math.max(s.peakEquity,eq);
  if (eq<=s.peakEquity*(1-CFG.maxDrawdown)) {
    s.halted=true; s.haltReason='PORTFOLIO_DRAWDOWN_5_PERCENT';
  }
  const decisions=[];
  for (const sym of SYMBOLS) {
    const m=market[sym], barTime=m.bars.at(-1).time, sig=signal(m.bars);
    const p=s.positions[sym], when=new Date(now).toISOString();
    let action='HOLD';
    if (p) {
      const change=m.q.price/p.entry-1;
      let reason=null;
      if (s.halted) reason='DRAWDOWN_HALTED';
      else if (change<=-CFG.stop) reason='STOP_3_PERCENT';
      else if (change>=CFG.take) reason='TAKE_6_PERCENT';
      else if (sig==='SELL'&&barTime>(s.processed[sym]||0)) reason='SMA_DOWN';
      if (reason&&sell(s,sym,m.q,when,reason)) action='PAPER_SELL';
    } else if (!s.halted && sig==='BUY' && barTime>(s.processed[sym]||0)) {
      if (buy(s,sym,m.q,when)) action='PAPER_BUY';
    }
    s.processed[sym]=Math.max(s.processed[sym]||0,barTime);
    decisions.push({symbol:sym,signal:sig,action,barTime});
  }
  s.lastRun=new Date(now).toISOString();
  return {mode:'PAPER',at:s.lastRun,equity:equity(s,marks),cash:s.cash,
    halted:s.halted,haltReason:s.haltReason,decisions};
}
export async function marketData(now=Date.now(),fetcher=fetch) {
  const result={};
  for (const sym of SYMBOLS) {
    const endpoint=API+'/products/'+sym;
    const [a,b]=await Promise.all([
      fetcher(endpoint+'/candles?granularity=900',{headers:{Accept:'application/json'}}),
      fetcher(endpoint+'/ticker',{headers:{Accept:'application/json'}})
    ]);
    if (!a.ok||!b.ok) throw Error('Public market API failed for '+sym);
    const bars=candles(await a.json(),now), q=quote(await b.json(),now);
    if (bars.length<52) throw Error('Insufficient complete price bars for '+sym);
    result[sym]={bars,q};
  }
  return result;
}
export function load(file) {
  if (!fs.existsSync(file)) return initialState();
  return validate(JSON.parse(fs.readFileSync(file,'utf8')));
}
export function save(file,s) {
  validate(s);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.tmp-'+process.pid;
  try {
    fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600,flag:'wx'});
    fs.renameSync(tmp,file);
  } finally {try {fs.unlinkSync(tmp)} catch {}}
}
export async function once(file,now=Date.now(),fetcher=fetch) {
  const s=load(file), market=await marketData(now,fetcher);
  const report=evaluate(s,market,now);
  save(file,s);
  return report;
}
async function main() {
  if (process.env.ATLAS_CRYPTO_MODE!=='PAPER') throw Error('ATLAS_CRYPTO_MODE must be PAPER');
  const file=process.env.ATLAS_CRYPTO_STATE||
    path.join(process.cwd(),'atlas-crypto-paper-state.json');
  const command=process.argv[2]||'once';
  if (!['run','once'].includes(command)) throw Error('Usage: once or run');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';
  const handle=fs.openSync(lock,'wx',0o600);
  try {
    do {
      try {console.log(JSON.stringify(await once(file)));}
      catch(e) {
        console.error(JSON.stringify({mode:'PAPER',error:String(e.message||e),traded:false}));
        if (command==='once') process.exitCode=1;
      }
      if (command!=='run') break;
      await new Promise(ok=>setTimeout(ok,CFG.intervalMs));
    } while (true);
  } finally {fs.closeSync(handle);fs.unlinkSync(lock);}
}
if (process.argv[1]&&path.resolve(process.argv[1])===
    path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
}
