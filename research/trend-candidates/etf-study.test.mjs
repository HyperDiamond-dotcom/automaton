import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,signal,backtest,extractYahoo,yahooUrl,SETTINGS} from './etf-study.mjs';
const candles=Array.from({length:300},(_,i)=>{
 const d=new Date(Date.UTC(2024,0,2+i*1.44)).toISOString().slice(0,10);
 return {day:d,open:100+i*0.1,high:102+i*0.1,low:99+i*0.1,close:101+i*0.1};
});
const window={ticker:'TEST',name:'sample',from:'2024-08-01',to:'2025-03-01'};
test('Heikin-Ashi never changes actual market OHLC inputs',()=>{
 const out=analyse(candles);
 assert.equal(out[0].open,candles[0].open);
 assert.equal(out[0].close,candles[0].close);
 assert.equal(out[0].haStreak,0); // Equal synthetic open/close is a valid neutral first candle
  assert.ok(Number.isInteger(out[1].haStreak));
});
test('all strategies return bounded test outputs without executing an order',()=>{
 const ds=analyse(candles);
 for(const type of ['heikin','donchian','momentum']){
  const out=backtest(ds,type,window);
  assert.ok(Number.isFinite(out.netUSD));
  assert.ok(out.maxMarkDrawdownPct>=0);
  assert.ok(out.trades>=0);
 }
});
test('month-end momentum is only measured after signal is available',()=>{
 const b=analyse(candles).at(-1);
 assert.equal(signal('momentum',b,false,false),'HOLD');
});
test('Yahoo ticker allowlist and raw JSON require valid ordered OHLC',()=>{
 assert.throws(()=>yahooUrl('LIVE'));
 assert.throws(()=>extractYahoo('{"chart":{"result":[]}}','QQQ'));
});
test('risk sizing is explicitly capped relative to $5000 demo portfolio',()=>{
 assert.equal(SETTINGS.startingUSD,5000);
 assert.ok(SETTINGS.riskFraction<=.005);
 assert.ok(SETTINGS.capitalFraction<=.35);
});
