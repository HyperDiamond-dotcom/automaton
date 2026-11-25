// State is account-bound and updated under one durable lock. One new order at most per run.
import {randomUUID} from 'node:crypto';
import {open,readFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';

const base='https://live.trading212.com/api/v0';
const buffer=1.02;
const positive=x=>Number.isFinite(x) && x>0;
const shares=x=>Math.floor(x*10000)/10000;
const issuer=name=>String(name??'').toLowerCase().replace(/\b(class [a-z]|ordinary shares?|common stock|adr|gdr)\b/g,'').replace(/[^a-z0-9]/g,'');
const fresh=(q,now)=>Number.isFinite(Date.parse(q.quoteAt)) && now>=Date.parse(q.quoteAt) &&
  now-Date.parse(q.quoteAt)<=120000 && now<q.sessionEnd && positive(q.price);
export function selectOrder(state, observations, positions, pending, free, fx, now) {
  const held=new Map(positions.map(p=>[p.instrument.ticker,p]));
  let invested=0;
  for (const [ticker,lot] of Object.entries(state.lots)) {
    const p=held.get(ticker);
    if (!p || Math.abs(p.quantity-lot.qty)>1e-7 || p.walletImpact?.currency!=='GBP' ||
        !positive(p.walletImpact.currentValue) || !positive(p.walletImpact.totalCost)) throw Error('Holdings need reconciliation');
    invested+=p.walletImpact.currentValue;
  }
  if (!Number.isFinite(state.cash) || state.cash<0) throw Error('Allocated cash needs reconciliation');
  const cash=Math.min(state.cash,free), pot=cash+invested;
  const rows=observations.filter(q=>q.status==='STRENGTH' && fresh(q,now) && q.isin && issuer(q.name))
    .sort((a,b)=>b.changeFromOpeningBarPct-a.changeFromOpeningBarPct || a.ticker.localeCompare(b.ticker));
  for (const q of rows) {
    const lot=state.lots[q.ticker], p=held.get(q.ticker);
    if (!lot || state.rallies[q.ticker]==='SELL' || pending.some(o=>o.instrument?.ticker===q.ticker || o.ticker===q.ticker)) continue;
    const rate=fx[q.currency];
    const qty=shares(lot.qty*.25);
    if (positive(rate) && qty>0 && qty<=p.quantityAvailableForTrading &&
        lot.qty*q.price*rate/buffer>p.walletImpact.totalCost)
      return {ticker:q.ticker,quantity:-qty,limitPrice:q.price,isin:q.isin,issuer:issuer(q.name),expires:Math.min(Date.parse(q.quoteAt)+120000,q.sessionEnd)};
  }
  const budget=Math.min(pot*.05,pot*.20-invested,cash);
  if (!positive(budget) || pending.length) return;
  for (const q of rows) {
    const key=issuer(q.name);
    if (state.rallies[q.ticker] || state.excluded.includes(q.isin) || state.excludedIssuers.includes(key) ||
        held.has(q.ticker) || positions.some(p=>p.instrument.isin===q.isin || issuer(p.instrument.name)===key) ||
        Object.values(state.lots).some(l=>l.isin===q.isin || l.issuer===key)) continue;
    const rate=fx[q.currency];
    if (!positive(rate)) continue;
    const qty=shares(budget/(q.price*rate*buffer));
    if (qty>0) return {ticker:q.ticker,quantity:qty,limitPrice:q.price,isin:q.isin,issuer:key,expires:Math.min(Date.parse(q.quoteAt)+120000,q.sessionEnd)};
  }
}

async function syncDirectory(dir) {
  const handle=await open(dir,'r');
  try {await handle.sync();} finally {await handle.close();}
}
async function writeState(dir,state) {
  const tmp=join(dir,'wealth-'+randomUUID()+'.tmp');
  const file=await open(tmp,'wx',0o600);
  try {await file.writeFile(JSON.stringify(state));await file.sync();} finally {await file.close();}
  await rename(tmp,join(dir,'atlas-wealth.json'));
  await syncDirectory(dir);
}

async function ratesFor(observations,transport,now) {
  const rates={GBP:1,GBX:.01};
  const currencies=[...new Set(observations.filter(q=>q.status==='STRENGTH' && fresh(q,now)).map(q=>q.currency))];
  await Promise.all(currencies.filter(c=>/^[A-Z]{3}$/.test(c) && !(c in rates)).map(async currency=>{
    const symbol=currency+'GBP=X';
    try {
      const response=await transport('https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?interval=1m&range=1d',
        {redirect:'error',signal:AbortSignal.timeout(6000)});
      if (!response.ok) return;
      const meta=(await response.json()).chart?.result?.[0]?.meta;
      const age=now-meta?.regularMarketTime*1000;
      if (meta?.symbol===symbol && meta.currency==='GBP' && age>=0 && age<=120000 && positive(meta.regularMarketPrice)) rates[currency]=meta.regularMarketPrice;
    } catch { /* No fresh conversion for this currency. */ }
  }));
  return rates;
}

export function settle(state,items) {
  const p=state.pending;
  const matches=items.filter(i=>i.order.id===p.brokerId);
  if (!matches.length) throw Error('Awaiting broker order history');
  const order=matches[0].order;
  if (!['FILLED','CANCELLED','REJECTED'].includes(order.status)) throw Error('Order still pending');
  const fills=new Map();
  for (const {fill} of matches) if(fill && !fills.has(fill.id)) fills.set(fill.id,fill);
  let qty=0,value=0;
  for (const f of fills.values()) {
    if (!Number.isSafeInteger(f.id) || f.type!=='TRADE' || f.walletImpact?.currency!=='GBP' ||
        !positive(Math.abs(f.quantity)) || !positive(Math.abs(f.walletImpact.netValue))) throw Error('Unverified fill');
    qty+=Math.abs(f.quantity); value+=Math.abs(f.walletImpact.netValue);
  }
  if (order.instrument?.ticker!==p.ticker || order.side!==(p.quantity>0?'BUY':'SELL') ||
      !Number.isFinite(order.filledQuantity) || Math.abs(qty-Math.abs(order.filledQuantity))>1e-7 ||
      qty>Math.abs(p.quantity)+1e-7 || (order.status==='FILLED' && Math.abs(qty-Math.abs(p.quantity))>1e-7)) throw Error('Fill quantity mismatch');
  if (qty && p.quantity>0) {
    state.lots[p.ticker]={qty,isin:p.isin,issuer:p.issuer};
    state.cash-=value;
  } else if (qty) {
    state.lots[p.ticker].qty-=qty;
    if(state.lots[p.ticker].qty<1e-7) delete state.lots[p.ticker];
    state.cash+=value;
  }
  delete state.pending;
}

export async function runWealth(observations,env=process.env,transport=fetch,now=Date.now) {
  const mode=env.ATLAS_MODE??'PREVIEW';
  if(mode==='PREVIEW') return {mode,status:'EXECUTION_OFF',ordersSubmitted:0};
  if(mode!=='LIVE') throw Error('Unknown ATLAS_MODE');
  const seed=Number(env.ATLAS_POT_GBP);
  if (!positive(seed) || !/^\d+(\.\d{1,2})?$/.test(env.ATLAS_POT_GBP)) throw Error('Set the dedicated ATLAS_POT_GBP first');
  const dir=env.ATLAS_LIVE_JOURNAL_DIR || env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!dir || !isAbsolute(dir) || (env.RAILWAY_ENVIRONMENT_ID &&
      (!env.RAILWAY_VOLUME_MOUNT_PATH || resolve(dir)!==resolve(env.RAILWAY_VOLUME_MOUNT_PATH)))) throw Error('Persistent volume required');
  if (!env.T212_LIVE_API_KEY || !env.T212_LIVE_API_SECRET) throw Error('Live credentials required');
  const auth=Buffer.from(env.T212_LIVE_API_KEY+':'+env.T212_LIVE_API_SECRET).toString('base64');
  async function request(path,body) {
    const response=await transport(base+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},
      redirect:'error',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
    if (!response.ok) throw Error('Broker HTTP '+response.status);
    return response.json();
  }
  const lockPath=join(dir,'atlas-wealth.lock');
  const lock=await open(lockPath,'wx',0o600);
  try {
    const summary=await request('/equity/account/summary');
    if (!Number.isSafeInteger(summary.id) || summary.currency!=='GBP' || !Number.isFinite(summary.cash?.availableToTrade) ||
        summary.cash.availableToTrade<0) throw Error('Invalid GBP account snapshot');
    const positions=await request('/equity/positions');
    const pending=await request('/equity/orders');
    if (!Array.isArray(positions)||!Array.isArray(pending)) throw Error('Invalid positions or orders');
    let state;
    try {state=JSON.parse(await readFile(join(dir,'atlas-wealth.json'),'utf8'));}
    catch (e) {
      if(e.code!=='ENOENT') throw e;
      if(seed>summary.cash.availableToTrade) throw Error('Dedicated pot exceeds available cash');
      state={version:1,account:summary.id,seed,cash:seed,lots:{},rallies:{},
        excluded:positions.map(p=>p.instrument.isin),excludedIssuers:positions.map(p=>issuer(p.instrument.name))};
      await writeState(dir,state);
    }
    if(state.version!==1 || state.seed!==seed || state.account!==summary.id) throw Error('Account or pot changed; reconcile journal first');
    if(state.pending) {
      if(!state.pending.brokerId) throw Error('Unknown submission outcome; reconcile the reserved order before resuming');
      if(pending.some(o=>o.id===state.pending.brokerId)) return {mode,status:'AWAITING_FILL',ordersSubmitted:0};
      const items=[],seen=new Set();
      let path='/equity/history/orders?limit=50&ticker='+encodeURIComponent(state.pending.ticker);
      while(path) {
        if(seen.has(path) || seen.size>=20) throw Error('Incomplete order history');
        seen.add(path);
        const page=await request(path);
        items.push(...page.items);
        if(!page.nextPagePath) break;
        const u=new URL(page.nextPagePath,base);
        if(u.origin!=='https://live.trading212.com' || u.pathname!=='/api/v0/equity/history/orders') throw Error('Unexpected history cursor');
        if(items.some(i=>i.order.id===state.pending.brokerId) && page.items.at(-1)?.order.id!==state.pending.brokerId) break;
        path='/equity/history/orders'+u.search;
        await new Promise(resolve=>setTimeout(resolve,3100));
      }
      settle(state,items);
      await writeState(dir,state);
    }
    // A clear pullback ends the rally. A marginal WATCH reading alone must not re-arm a sale.
    for(const q of observations) if(fresh(q,now()) && (q.status==='RALLY_FADING' ||
        (q.status==='WATCH' && q.changeFromOpeningBarPct<=1))) delete state.rallies[q.ticker];
    await writeState(dir,state);
    const rates=await ratesFor(observations,transport,now());
    const plan=selectOrder(state,observations,positions,pending,summary.cash.availableToTrade,rates,now());
    if(!plan) return {mode,status:'NO_ELIGIBLE_ORDER',ordersSubmitted:0};
    state.pending=plan;
    state.rallies[plan.ticker]=plan.quantity>0?'BUY':'SELL';
    await writeState(dir,state);
    if(now()>=plan.expires) {
      delete state.pending;delete state.rallies[plan.ticker];await writeState(dir,state);
      return {mode,status:'QUOTE_EXPIRED',ordersSubmitted:0};
    }
    const order=await request('/equity/orders/limit',{ticker:plan.ticker,quantity:plan.quantity,limitPrice:plan.limitPrice,timeValidity:'DAY'});
    if(!Number.isSafeInteger(order.id)||order.id<=0) throw Error('Missing broker order ID; review reservation');
    state.pending.brokerId=order.id;
    await writeState(dir,state);
    return {mode,status:'BROKER_ACKNOWLEDGED',ordersSubmitted:1,brokerOrderId:order.id,ticker:plan.ticker};
  } finally {await lock.close();await unlink(lockPath);}
}
