import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {selectOrder,runWealth,settle} from './atlas-wealth.mjs';
const now=Date.now();
const row={ticker:'ABC',name:'Example',isin:'GB001',currency:'GBP',price:1,status:'STRENGTH',quoteAt:new Date(now).toISOString(),sessionEnd:now+3600000,changeFromOpeningBarPct:7};
const initial=cash=>({cash,lots:{},rallies:{},excluded:[],excludedIssuers:[]});
const position=(qty,value,cost)=>({instrument:{ticker:'ABC',isin:'GB001',name:'Example'},quantity:qty,quantityAvailableForTrading:qty,walletImpact:{currency:'GBP',currentValue:value,totalCost:cost}});
test('sizing scales up and down, reserves costs and caps aggregate exposure',()=>{
  const pick=(state,rows=[row],ps=[])=>selectOrder(state,rows,ps,[],10000,{GBP:1},now);
  assert.equal(pick(initial(100)).quantity,4.9019);
  assert.equal(pick(initial(500)).quantity,24.5098);
  const s=initial(80);s.lots.ABC={qty:20,issuer:'example',isin:'GB001'};
  assert.equal(pick(s,[{...row,ticker:'B',name:'Other',isin:'GB002'}],[position(20,20,20)]),undefined);
  assert.equal(pick({...initial(100),excluded:['GB001']}),undefined);
  assert.equal(pick(initial(100),[{...row,status:'DELAYED_STRENGTH'}]),undefined);
  assert.equal(pick(initial(100),[{...row,quoteAt:new Date(now-121000).toISOString()}]),undefined);
  assert.equal(pick(initial(100),[{...row,ticker:'OTHER',isin:'OTHER'}],[position(1,1,1)]),undefined);
});
test('partial fills only credit confirmed quantity and GBP cash',()=>{
  const s=initial(100);
  s.pending={ticker:'ABC',isin:'GB001',issuer:'example',quantity:4,brokerId:19};
  const item={order:{id:19,side:'BUY',instrument:{ticker:'ABC'},status:'CANCELLED',filledQuantity:2},
    fill:{id:8,type:'TRADE',quantity:2,walletImpact:{netValue:-2.02,currency:'GBP'}}};
  settle(s,[item,item]);assert.equal(s.cash,97.98);assert.equal(s.lots.ABC.qty,2);
});
test('switch defaults off, validates prerequisites, and handles a broker timeout without retrying the buy',async t=>{
  assert.equal((await runWealth([row],{},()=>{throw Error('network');})).status,'EXECUTION_OFF');
  await assert.rejects(runWealth([],{ATLAS_MODE:'LIVE'}),/POT/);
  const dir=await mkdtemp(join(tmpdir(),'atlas-wealth-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const env={ATLAS_MODE:'LIVE',ATLAS_POT_GBP:'100',ATLAS_LIVE_JOURNAL_DIR:dir,T212_LIVE_API_KEY:'test',T212_LIVE_API_SECRET:'test'};
  let posts=0;
  async function broker(url,opt) {
    if(url.endsWith('/summary'))return Response.json({id:1,currency:'GBP',cash:{availableToTrade:100}});
    if(opt.method==='POST'){posts++;throw Error('network lost');}
    return Response.json([]);
  }
  await assert.rejects(runWealth([row],env,broker,()=>now),/network lost/);
  await assert.rejects(runWealth([row],env,broker,()=>now),/Unknown submission/);
  assert.equal(posts,1);
});
test('live sequence buys, reconciles, sells a quarter once and excludes the original holding',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'atlas-wealth-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const env={ATLAS_MODE:'LIVE',ATLAS_POT_GBP:'100',ATLAS_LIVE_JOURNAL_DIR:dir,T212_LIVE_API_KEY:'test',T212_LIVE_API_SECRET:'test'};
  const manual={...position(1,8,5),instrument:{ticker:'M',isin:'GBM',name:'Manual'}};
  const orders=[],history=[];let positions=[manual], pending=[];
  async function broker(url,opt) {
    if(url.endsWith('/summary'))return Response.json({id:1,currency:'GBP',cash:{availableToTrade:100}});
    if(url.endsWith('/positions'))return Response.json(positions);
    if(url.endsWith('/orders'))return Response.json(pending);
    if(url.includes('/history/'))return Response.json({items:history,nextPagePath:null});
    const body=JSON.parse(opt.body);orders.push(body);return Response.json({id:orders.length});
  }
  const run=rows=>runWealth(rows,env,broker,()=>now);
  await run([{...row,ticker:'M',isin:'GBM',name:'Manual'},row]);
  assert.equal(orders[0].ticker,'ABC');
  const bought=orders[0].quantity;
  pending=[{id:1}];assert.equal((await run([row])).status,'AWAITING_FILL');pending=[];
  function fill(id,qty,value){
    history.unshift({order:{id,side:qty>0?'BUY':'SELL',instrument:{ticker:'ABC'},status:'FILLED',filledQuantity:Math.abs(qty)},
      fill:{id,type:'TRADE',quantity:qty,walletImpact:{currency:'GBP',netValue:value}}});
  }
  fill(1,bought,-bought);positions=[manual,position(bought,bought*1.2,bought)];
  const rally={...row,price:1.2};
  await run([rally]);assert.equal(orders[1].quantity,-Math.floor(bought*.25*10000)/10000);
  const sold=-orders[1].quantity;fill(2,-sold,sold*1.2);positions=[manual,position(bought-sold,(bought-sold)*1.2,bought-sold)];
  await run([rally]);await run([{...rally,status:'WATCH',changeFromOpeningBarPct:4.9}]);await run([rally]);
  assert.equal(orders.length,2);
  await run([{...rally,status:'RALLY_FADING'}]);await run([rally]);assert.equal(orders.length,3);
  assert.ok(JSON.parse(await readFile(join(dir,'atlas-wealth.json'))).excluded.includes('GBM'));
});
