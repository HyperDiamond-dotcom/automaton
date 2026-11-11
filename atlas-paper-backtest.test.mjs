import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateAtlas} from './atlas-paper-backtest-core.mjs';
const barSec=900;
function fixture(n=400,trend=0.12) {
  const start=1790000000-1790000000%barSec;
  return Array.from({length:n},(_,i)=>{
    const close=100+i*trend+0.6*Math.sin(i/7),open=close-0.10;
    return [start+i*barSec,Math.min(close,open)-0.6,Math.max(close,open)+0.6,open,close,10000];
  });
}
test('no-lookahead simulation is valid on sequential candles',()=>{
  const res=simulateAtlas(fixture());
  assert.equal(res.executionAllowed,false);assert.equal(res.ordersSubmitted,0);
  assert.equal(res.mode,'BACKTEST_ONLY_NO_ORDERS');
  assert.equal(res.tradeCount,res.trades.length);
  assert.equal(res.barsTested,250);
  assert.ok(Number.isFinite(res.finalCash));
  assert.equal(res.maxDrawdownPct>=0,true);
  assert.ok(res.equityCurve.length===res.barsTested);
});
test('rejects gaps and duplicates, not interpolated',()=>{
  let rows=fixture();rows.splice(210,1);
  assert.throws(()=>simulateAtlas(rows),/non_contiguous_history/);
  rows=fixture();rows[210]=[...rows[209]];
  assert.throws(()=>simulateAtlas(rows),/non_contiguous_history/);
});
test('rejects invalid risk settings',()=>{
  assert.throws(()=>simulateAtlas(fixture(),{feeBps:-1}),/invalid_risk_assumptions/);
  assert.throws(()=>simulateAtlas(fixture(),{maxExposurePct:101}),/invalid_risk_assumptions/);
});
test('rejects malformed and short data',()=>{
  assert.throws(()=>simulateAtlas(fixture(10)),/insufficient_history/);
  let rows=fixture();rows[150][4]=-2;
  assert.throws(()=>simulateAtlas(rows),/invalid_candle/);
});
test('simulated fills cannot use a future candle to signal earlier',()=>{
  const rows=fixture(450);
  const a=simulateAtlas(rows.slice(0,400));
  const b=simulateAtlas(rows);
  assert.deepEqual(b.trades.filter(t=>Date.parse(t.exitTime)<rows[400][0]*1000),
    a.trades.filter(t=>Date.parse(t.exitTime)<rows[400][0]*1000 && t.reason!=='end_of_test'));
});
