import test from "node:test";
import assert from "node:assert/strict";
import {safeUrl,reconcile,runAudit} from "./atlas-demo-audit-core.mjs";
test("rejects any live-money or order-creation endpoint",()=>{
  assert.throws(()=>safeUrl("https://live.trading212.com/api/v0/equity/positions"));
  assert.throws(()=>safeUrl("/api/v0/equity/orders/market"));
  assert.throws(()=>safeUrl("https://evil.example/api/v0/equity/positions"));
});
test("detects unmatched positions, duplicate orders and stop-coverage risk",()=>{
  const position=[{ticker:"AAPL_US_EQ",quantity:10}];
  const order={ticker:"AAPL_US_EQ",side:"SELL",type:"STOP",quantity:3,stopPrice:90,status:"NEW"};
  const report=reconcile(position,[order,{...order}],[],true);
  assert.equal(report.executionAllowed,false);
  assert.equal(report.liveReady,false);
  assert.equal(report.issues.length,4);
});
test("allows only GET and DEMO for all requests",async()=>{
  const seen=[];
  const fetcher=async(url,options)=>{
    seen.push({url,method:options.method});
    const path=new URL(url).pathname;
    const body=path.endsWith("/positions")?[{ticker:"AAPL_US_EQ",quantity:1}]:
      path.endsWith("/equity/orders")?[]:{items:[],nextPagePath:null};
    return {ok:true,json:async()=>body};
  };
  const report=await runAudit({key:"mock",secret:"mock"},fetcher);
  assert.equal(seen.length,3);
  assert.ok(seen.every(x=>x.method==="GET"&&x.url.startsWith("https://demo.trading212.com/")));
  assert.equal(report.liveReady,false);
});
test("failed broker reads cannot produce a health pass",async()=>{
  const fetcher=async()=>({ok:false,status:401});
  await assert.rejects(runAudit({key:"mock",secret:"mock"},fetcher),/demo_api_http_401/);
});

test("rejects unsafe URL userinfo and invalid history parameters",()=>{
  for(const path of ["//demo.trading212.com/api/v0/equity/positions",
    "https://user:password@demo.trading212.com/api/v0/equity/positions",
    "/api/v0/equity/history/orders?limit=51",
    "/api/v0/equity/history/orders?limit=2&limit=3",
    "/api/v0/equity/history/orders?untrusted=1"])
    assert.throws(()=>safeUrl(path));
});
test("caps broker history at three pages and paces requests",async()=>{
  const delays=[],visited=[];
  const fetcher=async(url)=>{
    const path=new URL(url).pathname;visited.push(path);
    if(path.endsWith("/positions")||path.endsWith("/equity/orders"))
      return {ok:true,json:async()=>[]};
    const n=visited.filter(x=>x.endsWith("/history/orders")).length;
    return {ok:true,json:async()=>({items:[],nextPagePath:n<3?
      "/api/v0/equity/history/orders?limit=50&cursor="+n:null})};
  };
  const report=await runAudit({key:"test",secret:"test"},fetcher,{sleep:async ms=>delays.push(ms)});
  assert.equal(report.historyPagesRetrieved,3);
  assert.deepEqual(delays,[1200,1200,11000,11000]);
  assert.equal(report.liveReady,false);
});
test("history truncation is explicitly marked unverified",async()=>{
  const fetcher=async(url)=>{
    const path=new URL(url).pathname;
    return {ok:true,json:async()=>path.endsWith("/history/orders")?
      {items:[],nextPagePath:"/api/v0/equity/history/orders?limit=50&cursor=123"}:[]};
  };
  const report=await runAudit({key:"test",secret:"test"},fetcher,{maxPages:1});
  assert.equal(report.historyIncomplete,true);
  assert.ok(report.issues.some(x=>x.code==="HISTORY_INCOMPLETE"));
});
