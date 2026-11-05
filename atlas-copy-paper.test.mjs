import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperLedger,applyPaperCopySignal,paperSummary} from './atlas-copy-paper-core.mjs';
const now=Date.parse('2026-11-05T13:00:00Z');
const signal=(id, overrides={})=>({id,traderId:'APPROVED',symbol:'BTC-GBP',side:'BUY',
  priceGBP:50000,timestamp:new Date(now).toISOString(),leaderAllocationFraction:0.5,...overrides});
const apply=(state,s,ms=now)=>applyPaperCopySignal(state,s,{nowMs:ms,allowedTraders:['APPROVED']});
test('paper copies sized to 2% NAV with zero real execution',()=>{
  const r=apply(createPaperLedger(now),signal('test1'));
  assert.equal(r.status,'PAPER_BUY');assert.ok(r.notionalGBP<=20);assert.equal(r.ordersSubmitted,0);
  assert.equal(r.executionAllowed,false);assert.equal(r.realMoney,false);
  assert.ok(paperSummary(r.state).paperNAVGBP<1000);
});
test('disallows unapproved traders and duplicate signals',()=>{
  const initial=createPaperLedger(now);
  assert.equal(apply(initial,signal('bad',{traderId:'UNKNOWN'})).reason,'TRADER_NOT_ALLOWLISTED');
  const a=apply(initial,signal('same'));
  assert.equal(apply(a.state,signal('same')).reason,'DUPLICATE_SIGNAL');
});
test('blocks stale signals and unknown assets',()=>{
  assert.equal(apply(createPaperLedger(now),signal('stale',{timestamp:new Date(now-60*60*1000).toISOString()})).reason,'STALE_OR_FUTURE_SIGNAL');
  assert.throws(()=>apply(createPaperLedger(now),signal('foo',{symbol:'NOT_REAL'})),/invalid_signal_fields/);
});
test('limits daily entries and trader exposure',()=>{
  let s=createPaperLedger(now),applied=0;
  for(let i=0;i<10;i++){
    const r=apply(s,signal('s'+i));s=r.state;
    if(r.status==='PAPER_BUY')applied++;
  }
  assert.ok(s.daily.entryNotionalGBP<=50.00001);
  assert.ok(paperSummary(s).exposureGBP<=50.00001);
  assert.ok(applied<=4);
});
test('allows position reduction and never shorts',()=>{
  const b=apply(createPaperLedger(now),signal('buy'));
  const sell=apply(b.state,signal('sell',{side:'SELL',closeFraction:0.5}));
  assert.equal(sell.status,'PAPER_SELL');
  assert.ok(sell.state.positions['APPROVED::BTC-GBP'].units>0);
  const s=apply(createPaperLedger(now),signal('nope',{side:'SELL'}));
  assert.equal(s.reason,'NO_POSITION_TO_CLOSE');
});
test('halts entries on large adverse price move, permits closing',()=>{
  const b=apply(createPaperLedger(now),signal('buy'));
  const second=apply(b.state,signal('low',{priceGBP:1}));
  assert.equal(second.reason,'LOSS_CIRCUIT_BREAKER');
  const unwind=apply(second.state,signal('close',{side:'SELL',priceGBP:1}));
  assert.equal(unwind.status,'PAPER_SELL');
});
test('rejects bogus state and out-of-order clocks',()=>{
  assert.throws(()=>apply({},signal('x')),/invalid_paper_ledger/);
  const yesterday=createPaperLedger(now);
  assert.throws(()=>apply(yesterday,signal('x'),now-86400_000),/clock_moved_backwards/);
});