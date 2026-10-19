import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initialState,validate,sma,signal,candles,quote,equity,buy,sell,evaluate,load,save,CFG} from './crypto-paper.mjs';
const NOW=Date.UTC(2026,9,19,16,30,0);
const stamp=new Date(NOW-5000).toISOString();
function bars(last=100) {
  const first=NOW/1000-52*900;
  return Array.from({length:52},(_,i)=>({time:first+900*i,close:i===51?last:100}));
}
function q(p=100) {return {price:p,bid:p*.9999,ask:p*1.0001,time:stamp};}
function market(b=120,e=100,pb=b,pe=e) {
  return {'BTC-USD':{bars:bars(b),q:q(pb)},'ETH-USD':{bars:bars(e),q:q(pe)}};
}
test('initialized account cannot enable real trading',()=>{
  assert.equal(initialState().mode,'PAPER');
  assert.equal(initialState().cash,5000);
  assert.throws(()=>initialState(-10));
});
test('moving average crossover uses completed history only',()=>{
  assert.equal(signal(bars(120)),'BUY');
  assert.equal(signal(bars(80)),'SELL');
  assert.equal(signal(bars()),'HOLD');
  assert.equal(signal(bars().slice(-25)),'WAIT');
});
test('averages reject insufficient or corrupt candles',()=>{
  assert.equal(sma([1,2,3],3),2);
  assert.equal(sma([1,2],3),null);
  assert.equal(sma([1,-2,3],3),null);
});
test('candles reject unclosed and gapped data',()=>{
  const rows=bars().map(x=>[x.time,99,101,100,x.close]);
  assert.equal(candles([...rows,[NOW/1000,99,101,100,100]],NOW).length,52);
  rows[10][0]+=30;
  assert.equal(candles(rows,NOW).length,0);
});
test('quotes reject crossed, stale and wide-spread markets',()=>{
  assert.equal(quote(q(),NOW).price,100);
  assert.throws(()=>quote({...q(),bid:101,ask:100},NOW));
  assert.throws(()=>quote({...q(),time:new Date(NOW-180000).toISOString()},NOW));
  assert.throws(()=>quote({...q(),bid:90,ask:110},NOW));
});
test('simulated buys cap exposure and account for fees',()=>{
  const s=initialState();
  assert.equal(buy(s,'BTC-USD',q(),stamp),true);
  assert.ok(s.cash>=4499.99);
  assert.ok(equity(s,{'BTC-USD':100})<5000);
  assert.equal(s.fills.at(-1).simulated,true);
  assert.equal(buy(s,'BTC-USD',q(),stamp),false);
});
test('symbol allowlist and absence of short selling',()=>{
  const s=initialState();
  assert.equal(buy(s,'DOGE-USD',q(),stamp),false);
  assert.equal(sell(s,'BTC-USD',q(),stamp,'TEST'),false);
  assert.deepEqual(s.positions,{});
});
test('two positions remain below twenty percent equity exposure',()=>{
  const s=initialState();
  buy(s,'BTC-USD',q(),stamp);
  buy(s,'ETH-USD',q(),stamp);
  const gross=Object.values(s.positions).reduce((v,p)=>v+p.qty*p.mark,0);
  assert.ok(gross<1010);
});
test('a crossover buys only once in the same completed candle',()=>{
  const s=initialState();
  assert.equal(evaluate(s,market(),NOW).decisions[0].action,'PAPER_BUY');
  assert.equal(evaluate(s,market(),NOW+10000).decisions[0].action,'HOLD');
  assert.equal(s.fills.length,1);
});
test('a three percent adverse move triggers simulated stop',()=>{
  const s=initialState();
  evaluate(s,market(),NOW);
  assert.equal(evaluate(s,market(120,100,110),NOW+10000).decisions[0].action,'PAPER_SELL');
  assert.equal(s.fills.at(-1).reason,'STOP_3_PERCENT');
});
test('five percent account drawdown permanently halts entries',()=>{
  const s=initialState();
  evaluate(s,market(120,120),NOW);
  s.peakEquity=6000;
  const report=evaluate(s,market(120,120,100,100),NOW+10000);
  assert.equal(report.halted,true);
  assert.equal(Object.keys(s.positions).length,0);
  evaluate(s,market(120,120),NOW+20000);
  assert.equal(Object.keys(s.positions).length,0);
});
test('stale data fails without any paper trade',()=>{
  const s=initialState(), m=market();
  m['ETH-USD'].q.time=new Date(NOW-180000).toISOString();
  assert.throws(()=>evaluate(s,m,NOW));
  assert.equal(s.fills.length,0);
});
test('save load and corrupt state fail closed',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-crypto-')),file=path.join(dir,'paper.json');
  try {
    save(file,initialState());assert.equal(load(file).mode,'PAPER');
    fs.writeFileSync(file,'{bad');assert.throws(()=>load(file));
    assert.throws(()=>validate({...initialState(),mode:'LIVE'}));
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
test('round-trip transaction loses simulated fees and spread',()=>{
  const s=initialState();
  buy(s,'BTC-USD',q(),stamp);
  sell(s,'BTC-USD',q(),stamp,'TEST');
  assert.ok(s.cash<5000);
});
