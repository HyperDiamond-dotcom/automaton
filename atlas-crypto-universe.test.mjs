import test from "node:test";
import assert from "node:assert/strict";
import {CANDIDATES,MAX_PAIRS,selectUniverse} from "./atlas-crypto-universe.mjs";
const now = Date.parse("2026-10-26T15:00:00Z");
function fixture() {
  return {
    products:CANDIDATES.map(id=>({id,status:"online",trading_disabled:false,
      quote_currency:"USD",limit_only:false,post_only:false,cancel_only:false})),
    volumes:CANDIDATES.map(id=>({id,market_types:["spot"],spot_volume_24hour:"1000000"})),
    quotes:Object.fromEntries(CANDIDATES.map((id,i)=>[id,{bid:"100",ask:"100.10",
      price:String(100+i),time:new Date(now-20000).toISOString()}]))
  };
}
test("caps scans, preserves liquid BTC/ETH and never admits arbitrary symbols",()=>{
  const {products,volumes,quotes}=fixture();
  const selected=selectUniverse(products,volumes,quotes,now);
  assert.equal(selected.length,MAX_PAIRS);
  assert.equal(selected[0].pair,"BTC-USD");
  assert.equal(selected[1].pair,"ETH-USD");
  assert.equal(new Set(selected.map(x=>x.pair)).size,MAX_PAIRS);
  assert.ok(selected.every(x=>CANDIDATES.includes(x.pair)));
});
test("ignores delisted, restricted and non-spot markets",()=>{
  const {products,volumes,quotes}=fixture();
  products[0].status="delisted";
  products[1].trading_disabled=true;
  products[2].limit_only=true;
  volumes[3].market_types=["rfq"];
  assert.ok(!selectUniverse(products,volumes,quotes,now).some(x=>["BTC-USD","ETH-USD","SOL-USD","XRP-USD"].includes(x.pair)));
});
test("rejects wide spreads, low notional, stale and invalid quotes",()=>{
  const {products,volumes,quotes}=fixture();
  quotes["BTC-USD"].ask="105";
  quotes["ETH-USD"].time=new Date(now-3600000).toISOString();
  quotes["SOL-USD"].price="0.00001";
  quotes["XRP-USD"].bid="-1";
  assert.ok(!selectUniverse(products,volumes,quotes,now).some(x=>["BTC-USD","ETH-USD","SOL-USD","XRP-USD"].includes(x.pair)));
});
test("validates universe inputs, refuses arbitrary fallback",()=>{
  assert.throws(()=>selectUniverse(null,[],{},now),/invalid_universe_inputs/);
  assert.deepEqual(selectUniverse([],[],{},now),[]);
});
