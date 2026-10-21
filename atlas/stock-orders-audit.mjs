import fs from 'node:fs';
import path from 'node:path';
const BASE='https://demo.trading212.com';
const PREFIX='/api/v0';
export const MAX_PAGES=3;

// Read-only audit, DEMO endpoint exclusively. No POST/DELETE methods implemented.
export function validateHistoryPath(p) {
  if(typeof p!=='string'||!p||p.startsWith('//')||p.includes('\\')) throw Error('Unsafe history path');
  const u=new URL(p,BASE);
  if(u.origin!==BASE||u.pathname!==PREFIX+'/equity/history/orders'||u.username||u.password||u.hash)
    throw Error('Untrusted historical-order cursor path');
  const keys=[...u.searchParams.keys()];
  if(keys.some(k=>!['limit','cursor'].includes(k))||new Set(keys).size!==keys.length)
    throw Error('Untrusted history query');
  const limit=u.searchParams.get('limit');
  if(limit!==null&&(!/^\d+$/.test(limit)||Number(limit)<1||Number(limit)>50)) throw Error('Invalid limit');
  const cursor=u.searchParams.get('cursor');
  if(cursor!==null&&(!/^\d+$/.test(cursor)||cursor.length>40)) throw Error('Invalid cursor');
  return u.toString();
}
export function credentials(env=process.env) {
  if(!env.T212_API_KEY||!env.T212_API_SECRET) throw Error('Missing DEMO credentials');
  return 'Basic '+Buffer.from(env.T212_API_KEY+':'+env.T212_API_SECRET).toString('base64');
}
async function getJson(url,auth,fetcher=fetch) {
  const r=await fetcher(url,{method:'GET',headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw Error('Trading212 DEMO read failed: HTTP '+r.status);
  return r.json();
}
export function normalizeHistoryOrder(item) {
  const o=item?.order??item, id=o?.id;
  if(!((typeof id==='number'&&Number.isSafeInteger(id)&&id>=0)||
       (typeof id==='string'&&/^\d+$/.test(id)))) return null;
  const q=Number(o.filledQuantity??item?.filledQuantity);
  const f=item?.fill?.id!=null?Number(item.fill.quantity??item.fill.filledQuantity):NaN;
  return {...o,id:String(id),filledQuantity:Number.isFinite(q)&&q>0?q:
    Number.isFinite(f)&&f>0?f:0};
}
export async function fetchDemoOrders(opts={}) {
  const auth=credentials(opts.env||process.env), fetcher=opts.fetcher||fetch;
  let url=BASE+PREFIX+'/equity/history/orders?limit=50',pages=0,next=null;
  let malformedHistoryRecords=0;
  const orders=new Map(),visited=new Set();
  while(url&&pages<MAX_PAGES) {
    url=validateHistoryPath(url);
    if(visited.has(url)) throw Error('Repeated pagination cursor');
    visited.add(url);
    const data=await getJson(url,auth,fetcher);
    if(!Array.isArray(data?.items)) throw Error('Invalid broker history');
    for(const item of data.items) {
      const o=normalizeHistoryOrder(item);
      if(!o){malformedHistoryRecords++;continue;}
      const old=orders.get(o.id);
      if(!old||o.filledQuantity>old.filledQuantity) orders.set(o.id,o);
    }
    pages++;
    next=data.nextPagePath==null?null:validateHistoryPath(data.nextPagePath);
    url=next;
  }
  const pending=await getJson(BASE+PREFIX+'/equity/orders',auth,fetcher);
  if(!Array.isArray(pending)) throw Error('Invalid broker pending orders');
  return {history:[...orders.values()],pending,pages,
    historyComplete:next===null,malformedHistoryRecords};
}
export function reconcile(journal,broker) {
  if(!Array.isArray(journal)||!Array.isArray(broker?.history)||!Array.isArray(broker?.pending))
    throw Error('Invalid evidence input');
  const all=new Map(),pendingIds=new Set();
  for(const record of broker.pending){
    const o=normalizeHistoryOrder(record);
    if(o){all.set(o.id,o);pendingIds.add(o.id);}
  }
  for(const record of broker.history){
    const o=normalizeHistoryOrder(record);
    if(o&&(!all.has(o.id)||o.filledQuantity>=all.get(o.id).filledQuantity)) all.set(o.id,o);
  }
  const audit=journal.map(record=>{
    const raw=record?.brokerOrderId??record?.orderId??record?.id;
    const valid=(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0)||
      (typeof raw==='string'&&/^\d+$/.test(raw));
    const id=valid?String(raw):null,match=id?all.get(id):null;
    const wrongTicker=Boolean(match&&record?.ticker&&match.ticker&&record.ticker!==match.ticker);
    const filled=Number(match?.filledQuantity);
    let state='UNVERIFIED';
    if(wrongTicker) state='MISMATCHED_TICKER';
    else if(match&&Number.isFinite(filled)&&filled>0) state='FILL_CONFIRMED';
    else if(match&&pendingIds.has(id)) state='PENDING';
    else if(match) state='BROKER_RECORD_NO_CONFIRMED_FILL';
    return {brokerOrderId:id,ticker:record?.ticker??null,state,
      confirmedFilledQuantity:state==='FILL_CONFIRMED'?filled:0};
  });
  const unverified=audit.filter(x=>['UNVERIFIED','MISMATCHED_TICKER'].includes(x.state)).length;
  const blockers=[];
  if(broker.historyComplete!==true) blockers.push('Historical orders incomplete or not independently verified');
  if((broker.malformedHistoryRecords??0)>0) blockers.push('Invalid history records');
  if(unverified) blockers.push('Submitted order IDs unmatched or inconsistent');
  if(!journal.length) blockers.push('Missing submitted-order journal');
  blockers.push('Original council unsafe approvals have not been cleared');
  return {environment:'DEMO',status:'UNRECONCILED',submitted:journal.length,
    confirmedFilledOrders:audit.filter(x=>x.state==='FILL_CONFIRMED').length,
    unverified,historyComplete:broker.historyComplete===true,
    malformedHistoryRecords:broker.malformedHistoryRecords??0,
    blockers,orders:audit,allowAutomaticOrders:false,profitabilityDemonstrated:false,
    note:'Read-only. Accepted orders and positions do not prove fills. Does not enable trading.'};
}
async function main() {
  const file=process.argv[2];
  if(!file)throw Error('Usage: node stock-orders-audit.mjs ./atlas-order-journal.json');
  const journal=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  const broker=await fetchDemoOrders();
  const report=reconcile(journal,broker);
  console.log(JSON.stringify(report,null,2));
  if(report.status==='UNRECONCILED') process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
