import test from "node:test";
import assert from "node:assert/strict";
import {STOCKS,analyzeDailyChart,retryMarketDataRequest} from "./atlas-stock-daily-core.mjs";
const now=Date.parse("2026-10-26T15:00:00Z");
function fixture() {
  const timestamps=Array.from({length:80},(_,i)=>Math.floor((now-(81-i)*86400_000)/1000));
  const close=timestamps.map((_,i)=>100+i*0.5);
  const high=close.map(x=>x+0.25);
  const volume=close.map(()=>1000000);
  return {chart:{result:[{meta:{symbol:"AAPL",currency:"USD",instrumentType:"EQUITY"},
    timestamp:timestamps,indicators:{quote:[{close,high,volume}]}}]}};
}
test("daily scanner uses approved stocks and never orders",()=>{
  const r=analyzeDailyChart(fixture(),"AAPL",now);
  assert.ok(["NO_ENTRY","LONG_WATCH"].includes(r.signal));
  assert.equal(r.executionAllowed,false);
  assert.equal(r.ordersSubmitted,0);
  assert.ok(STOCKS.length>=30);
});
test("rejects non-whitelisted symbols and mismatched provider response",()=>{
  assert.throws(()=>analyzeDailyChart(fixture(),"FAKE",now),/invalid_stock_symbol/);
  assert.throws(()=>analyzeDailyChart(fixture(),"MSFT",now),/unexpected_market_data_metadata/);
});
test("rejects sparse or stale data",()=>{
  let f=fixture();f.chart.result[0].timestamp=f.chart.result[0].timestamp.slice(-4);
  assert.throws(()=>analyzeDailyChart(f,"AAPL",now),/insufficient_daily_bars/);
  assert.throws(()=>analyzeDailyChart(fixture(),"AAPL",now+20*86400_000),/stale_daily_data/);
});
test("ignores incomplete same-day bar before US close",()=>{
  const f=fixture(),r=f.chart.result[0];
  r.timestamp.push(Math.floor(Date.parse("2026-10-26T13:30:00Z")/1000));
  r.indicators.quote[0].close.push(10000);
  r.indicators.quote[0].high.push(10001);
  r.indicators.quote[0].volume.push(1000000);
  assert.ok(analyzeDailyChart(f,"AAPL",now).close<1000);
});

test("recovers from temporary market-data network errors",async()=>{
  let attempts=0;const waits=[];
  const value=await retryMarketDataRequest(async()=>{attempts++;if(attempts<3)throw new TypeError("fetch failed");return "chart";},
    {sleep:async ms=>waits.push(ms)});
  assert.equal(value,"chart");assert.equal(attempts,3);assert.deepEqual(waits,[1500,3000]);
});
test("does not retry non-transient errors",async()=>{
  let attempts=0;
  await assert.rejects(()=>retryMarketDataRequest(async()=>{attempts++;throw Error("market_data_http_401");},
    {sleep:async()=>{}}),/market_data_http_401/);
  assert.equal(attempts,1);
});
test("fails closed after temporary errors persist",async()=>{
  let attempts=0;
  await assert.rejects(()=>retryMarketDataRequest(async()=>{attempts++;throw Error("market_data_http_429");},
    {sleep:async()=>{}}),/market_data_http_429/);
  assert.equal(attempts,3);
});
