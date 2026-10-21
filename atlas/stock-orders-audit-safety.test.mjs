import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistoryPath,normalizeHistoryOrder,fetchDemoOrders,reconcile} from './stock-orders-audit.mjs';

test('broker history query is allowlisted and refuses repeated or malformed params',()=>{
  for(const bad of [
    '//evil.example/api/v0/equity/history/orders',
    '/api/v0/equity/history/orders?limit=0',
    '/api/v0/equity/history/orders?limit=51',
    '/api/v0/equity/history/orders?limit=50&limit=50',
    '/api/v0/equity/history/orders?cursor=1&cursor=2',
    '/api/v0/equity/history/orders?secret=foo',
    '/api/v0/equity/orders',
  ]) assert.throws(()=>validateHistoryPath(bad),bad);
  assert.match(validateHistoryPath('/api/v0/equity/history/orders?limit=50&cursor=123'),/cursor=123/);
});
test('nested order plus fill is normalized only with positive quantity',()=>{
  assert.equal(normalizeHistoryOrder({order:{id:42,status:'FILLED',ticker:'AAPL_US_EQ'},fill:{id:11,quantity:0.5}}).filledQuantity,0.5);
  assert.equal(normalizeHistoryOrder({order:{id:42,status:'FILLED'},fill:{id:11,quantity:0}}).filledQuantity,0);
  assert.equal(normalizeHistoryOrder({order:{id:'n/a',status:'FILLED'},fill:{id:11,quantity:1}}),null);
});
test('reconciliation always blocks automatic orders and rejects unsupported inferred fills',()=>{
  const broker={history:[{order:{id:42,ticker:'AAPL_US_EQ',status:'FILLED'},fill:{id:77,quantity:1}}],
     pending:[],historyComplete:true,malformedHistoryRecords:0};
  const ok=reconcile([{brokerOrderId:42,ticker:'AAPL_US_EQ'}],broker);
  assert.equal(ok.confirmedFilledOrders,1);
  assert.equal(ok.status,'UNRECONCILED');
  assert.equal(ok.allowAutomaticOrders,false);
  assert.equal(ok.profitabilityDemonstrated,false);
  const wrong=reconcile([{brokerOrderId:42,ticker:'TSLA_US_EQ'}],broker);
  assert.equal(wrong.orders[0].state,'MISMATCHED_TICKER');
  assert.equal(wrong.confirmedFilledOrders,0);
  const missing=reconcile([{brokerOrderId:99,ticker:'AAPL_US_EQ'}],broker);
  assert.equal(missing.orders[0].state,'UNVERIFIED');
});
test('pagination cap exposes partial history and applies supplied sleeps',async()=>{
  let count=0,sleeps=0;
  const fetcher=async(url,options)=>{
    assert.equal(options.method,'GET');
    assert.match(String(url),/^https:\/\/demo\.trading212\.com\/api\/v0\//);
    if(String(url).endsWith('/equity/orders')) return {ok:true,json:async()=>[]};
    ++count;
    return {ok:true,json:async()=>({items:[{order:{id:count,status:'FILLED'},fill:{id:count,quantity:0.25}}],
      nextPagePath:'/api/v0/equity/history/orders?limit=50&cursor='+count})};
  };
  const snapshot=await fetchDemoOrders({
    env:{T212_API_KEY:'fake',T212_API_SECRET:'fake'},fetcher,sleep:async ms=>{assert.equal(ms,11000);sleeps++;}
  });
  assert.equal(count,3);assert.equal(sleeps,2);
  assert.equal(snapshot.pages,3);assert.equal(snapshot.historyComplete,false);
  assert.equal(snapshot.history.length,3);
  const report=reconcile([{brokerOrderId:1}],snapshot);
  assert.equal(report.status,'UNRECONCILED');
  assert.equal(report.allowAutomaticOrders,false);
  assert.ok(report.blockers.some(s=>s.includes('incomplete')));
});
test('invalid broker pagination fails closed before contacting a second host',async()=>{
  let reads=0;
  const fetcher=async()=>{reads++;return {ok:true,json:async()=>({
    items:[{order:{id:1}}],nextPagePath:'https://attacker.example/capture'})};};
  await assert.rejects(fetchDemoOrders({
    env:{T212_API_KEY:'fake',T212_API_SECRET:'fake'},fetcher
  }));
  assert.equal(reads,1);
});
