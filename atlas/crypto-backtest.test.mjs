import test from 'node:test';
import assert from 'node:assert/strict';
import {fromCoinbase,backtest,assertAlignment,fetchHistory} from './crypto-backtest.mjs';
const begin=1791000000-(1791000000%900);
function mk(sym='BTC') {
 return Array.from({length:90},(_,i)=>{
  const o=100+(sym==='BTC'?i*.1:-i*.1),c=o+.02;
  return {time:begin+i*900,open:o,close:c,low:o-.1,high:o+.1};
 });
}
test('Coinbase candle validation prevents malformed records',()=>{
 const r=fromCoinbase([[begin,99,101,100,100],[begin+900,99,101,100,100]]);
 assert.equal(r.length,2);
 assert.throws(()=>fromCoinbase([[begin,-1,101,100,100]]));
});
test('backtester enforces strictly aligned candles',()=>{
 assert.throws(()=>assertAlignment({'BTC-USD':mk(),'ETH-USD':mk().slice(1)}));
 let eth=mk('ETH');eth[14].time+=900;
 assert.throws(()=>assertAlignment({'BTC-USD':mk(),'ETH-USD':eth}));
});
test('next-bar-open simulation produces deterministic reports without exchange keys',()=>{
 const data={'BTC-USD':mk(),'ETH-USD':mk('ETH')};
 const a=backtest(data),b=backtest(data);
 assert.equal(a.barsEvaluated,38);
 assert.deepEqual(a,b);
 assert.equal(a.startingVirtualUSD,5000);
 assert.ok(Number.isFinite(a.netReturnPct));
 assert.match(a.disclaimer,/Historical simulation/);
 assert.equal(a.observations[0].time,new Date((begin+52*900)*1000+1000).toISOString());
});
test('historical fetch rejects invalid ranges without making requests',async()=>{
 await assert.rejects(()=>fetchHistory(91,()=>{throw Error('Should not fetch')}));
});
