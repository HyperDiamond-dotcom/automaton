import test from "node:test";
import assert from "node:assert/strict";
import {demoGet,validateDemoPath,snapshotDemo,reconcileDemo} from "./audit-demo.mjs";
import {checkDemoBuy} from "./demo-risk.mjs";

test("DEMO read-only URL allowlist blocks trading and external hosts",async()=>{
  assert.equal(validateDemoPath("/api/v0/equity/history/orders?limit=50"),"/api/v0/equity/history/orders?limit=50");
  assert.throws(()=>validateDemoPath("//live.trading212.com/api/v0/equity/orders"));
  assert.throws(()=>validateDemoPath("/api/v0/equity/orders/market"));
  await assert.rejects(demoGet("/api/v0/equity/orders/market",{key:"a",secret:"b"}));
});
test("read-only fetch never POSTs an order",async()=>{
  let method,url;
  const result=await demoGet("/api/v0/equity/positions",{key:"a",secret:"b",
    fetcher:async (u,o)=>{method=o.method;url=u;return {ok:true,json:async()=>[]}}});
  assert.deepEqual(result,[]);
  assert.equal(method,"GET");
  assert.match(url,/^https:\/\/demo\.trading212\.com\/api\/v0\//);
});
test("partial history and missing fills are not falsely marked verified",async()=>{
  const fixtures={
    "/api/v0/equity/account/summary":{},
    "/api/v0/equity/positions":[{ticker:"AAPL_US_EQ"}],
    "/api/v0/equity/orders":[],
    "/api/v0/equity/history/orders?limit=50":{items:[
      {order:{id:1,status:"FILLED"},fill:{id:99}},
      {order:{id:2,status:"CANCELLED"}},
      {order:{id:1,status:"FILLED"},fill:{id:99}} ],
      nextPagePath:"/api/v0/equity/history/orders?limit=50&cursor=5"},
    "/api/v0/equity/history/orders?limit=50&cursor=5":{items:[],nextPagePath:null}
  };
  const request=async p=>fixtures[p];
  const partial=await snapshotDemo({request,maxPages:1});
  assert.equal(partial.historyComplete,false);
  const report=reconcileDemo(partial,{submittedBuyOrders:5,confirmedFilledBuyOrders:0,unsafeCouncilApprovals:4});
  assert.equal(report.historicalOrders,2);
  assert.equal(report.historicalFillsObserved,1);
  assert.equal(report.statusCounts.CANCELLED,1);
  assert.equal(report.evidenceVerified,false);
  assert.equal(report.allowAutomaticOrders,false);
  const full=await snapshotDemo({request,maxPages:2,sleep:async()=>{}});
  assert.equal(full.historyComplete,true);
});
test("pure risk gate fails closed on unknown data, FX, council, wrong ticker, exposure",()=>{
  const x={environment:"DEMO",liveTrading:false,ticker:"AAPL_US_EQ",instrumentType:"STOCK",
    instrumentCurrency:"USD",accountCurrency:"USD",quantity:1,price:100,stopPrice:95,
    accountEquity:1000,existingExposure:0,existingPositions:0,autoExecuteEnabled:true,
    councilVerified:true,ledgerReconciled:true};
  assert.equal(checkDemoBuy(x).allowed,true);
  for(const change of [{environment:"LIVE"},{accountCurrency:"GBP"},{councilVerified:false},
    {ticker:"AMDd_EQ"},{quantity:2},{existingPositions:5},{stopPrice:0.01},
    {ledgerReconciled:false},{autoExecuteEnabled:false}])
    assert.equal(checkDemoBuy({...x,...change}).allowed,false,JSON.stringify(change));
});
