import fs from 'node:fs';
import path from 'node:path';
const BASE='https://demo.trading212.com';
const PREFIX='/api/v0';
export const MAX_PAGES=3;

// Read-only audit, DEMO endpoint exclusively. No POST/DELETE methods implemented.
export function validateHistoryPath(p) {
  if (typeof p!=='string') throw Error('Missing next page path');
  const u=new URL(p,BASE);
  if(u.origin!==BASE||u.pathname!==PREFIX+'/equity/history/orders'||u.username||u.password||
    u.hash||u.searchParams.has('ticker')||Number(u.searchParams.get('limit')||50)>50)
    throw Error('Untrusted historical-order cursor path');
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
export async function fetchDemoOrders(opts={}) {
  const auth=credentials(opts.env||process.env), fetcher=opts.fetcher||fetch;
  let url=BASE+PREFIX+'/equity/history/orders?limit=50', pages=0;
  const history=[], ids=new Set();
  do {
    url=validateHistoryPath(url);
    const data=await getJson(url,auth,fetcher);
    if(!Array.isArray(data?.items)) throw Error('Invalid broker history');
    for(const item of data.items){
      if(item && (typeof item.id==='string'||typeof item.id==='number')&&!ids.has(String(item.id))){
        ids.add(String(item.id));history.push(item);
      }
    }
    pages++;
    if(data.nextPagePath && pages<MAX_PAGES) url=data.nextPagePath;
    else url=null;
  } while(url);
  const pending=await getJson(BASE+PREFIX+'/equity/orders',auth,fetcher);
  if(!Array.isArray(pending)) throw Error('Invalid broker pending orders');
  return {history,pending,pages};
}
export function reconcile(journal,broker) {
  if(!Array.isArray(journal)||!Array.isArray(broker?.history)||!Array.isArray(broker?.pending))
    throw Error('Invalid evidence input');
  const all=new Map([...broker.history,...broker.pending]
    .filter(o=>o&&o.id!==undefined&&o.id!==null)
    .map(o=>[String(o.id),o]));
  const audit=journal.map(o=>{
    const id=o?.brokerOrderId??o?.orderId??o?.id;
    const match=id==null?null:all.get(String(id));
    const filled=Number(match?.filledQuantity);
    let state='UNVERIFIED';
    if(match && Number.isFinite(filled) && filled>0) state='FILL_CONFIRMED';
    else if(match && broker.pending.some(p=>String(p.id)===String(id))) state='PENDING';
    else if(match) state='BROKER_RECORD_NO_CONFIRMED_FILL';
    return {brokerOrderId:id??null,ticker:o?.ticker??null,state,confirmedFilledQuantity:state==='FILL_CONFIRMED'?filled:0};
  });
  return {environment:'DEMO',status:audit.some(r=>r.state==='UNVERIFIED')?'UNRECONCILED':'PARTIALLY_RECONCILED',
    submitted:journal.length,confirmedFilledOrders:audit.filter(x=>x.state==='FILL_CONFIRMED').length,
    unverified:audit.filter(x=>x.state==='UNVERIFIED').length,orders:audit,
    note:'Read-only report. Never infer a fill from an accepted order or a live position.'};
}
async function main() {
  const file=process.argv[2];
  if(!file)throw Error('Usage: node stock-orders-audit.mjs ./atlas-order-journal.json');
  const journal=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  const broker=await fetchDemoOrders();
  const report=reconcile(journal,broker);
  console.log(JSON.stringify(report,null,2));
  if(report.unverified) process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
