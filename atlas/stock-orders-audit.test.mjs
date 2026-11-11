import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistoryPath,credentials,fetchDemoOrders,reconcile} from './stock-orders-audit.mjs';
test('history cursor locked to demo broker same path',()=>{
 assert.match(validateHistoryPath('/api/v0/equity/history/orders?limit=50&cursor=2'),/cursor=2/);
 for(const bad of ['https://live.trading212.com/api/v0/equity/history/orders',
 'https://evil.example/api/v0/equity/history/orders',
 '/api/v0/equity/orders',
 '/api/v0/equity/history/orders?limit=500'])
  assert.throws(()=>validateHistoryPath(bad));
});
test('missing account keys fails without brokerage request',()=>{
 assert.throws(()=>credentials({}));
});
test('submitted order alone is NEVER marked as filled',()=>{
 const report=reconcile([{orderId:42,ticker:'AAPL_US_EQ'}],{history:[],pending:[]});
 assert.equal(report.confirmedFilledOrders,0);
 assert.equal(report.orders[0].state,'UNVERIFIED');
});
test('fill only confirmed by positive broker filledQuantity',()=>{
 const a=reconcile([{orderId:10},{orderId:11},{orderId:12}],
  {history:[{id:10,status:'FILLED',filledQuantity:1},{id:11,status:'FILLED'}],
   pending:[{id:12,filledQuantity:0}]});
 assert.equal(a.confirmedFilledOrders,1);
 assert.equal(a.orders[1].state,'BROKER_RECORD_NO_CONFIRMED_FILL');
 assert.equal(a.orders[2].state,'PENDING');
});
test('only read-only methods and limited pages are used',async()=>{
 const urls=[];
 const fetcher=async(url,opts)=>{
   urls.push([String(url),opts.method]);
   if(String(url).endsWith('/equity/orders'))return {ok:true,json:async()=>[]};
   const urlObj=new URL(url);
   const cursor=urlObj.searchParams.get('cursor');
   return {ok:true,json:async()=>({
     items:[{id:cursor||1,filledQuantity:1}],
     nextPagePath:cursor==='3'?null:
       '/api/v0/equity/history/orders?limit=50&cursor='+(cursor?Number(cursor)+1:2)
   })};
 };
 const broker=await fetchDemoOrders({env:{T212_API_KEY:'test',T212_API_SECRET:'fake'},fetcher});
 assert.equal(broker.pages,3);
 assert.equal(broker.history.length,3);
 assert.ok(urls.every(([url,method])=>method==='GET'&&url.startsWith('https://demo.trading212.com/api/v0/')));
});
test('malicious page cursor refuses further requests',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({items:[],nextPagePath:'https://evil.example/steal'})});
 await assert.rejects(()=>fetchDemoOrders({env:{T212_API_KEY:'x',T212_API_SECRET:'y'},fetcher}));
});
