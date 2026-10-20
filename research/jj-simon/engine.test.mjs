import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBar,qualifies,atr,runReplay,SETTINGS} from './engine.mjs';
const cols=['datetime','open','high','low','close','volume','source','trading_date','session'];
test('parse timezone-offset New York NQ candle, preserving the local session clock',()=>{
 const b=parseBar('2026-10-05 09:30:00-04:00,25000,25003,24998,25002,1,a,2026-10-05,NY',cols);
 assert.equal(b.day,'2026-10-05');assert.equal(b.minute,570);
 assert.equal(new Date(b.time).toISOString(),'2026-10-05T13:30:00.000Z');
});
test('reject invalid timestamp and corrupted OHLC',()=>{
 assert.throws(()=>parseBar('2026-10-05 09:30:00,1,2,1,2',cols));
 assert.throws(()=>parseBar('2026-10-05 09:30:00-04:00,3,2,1,3',cols));
});
function candle(i,open,close,high=Math.max(open,close)+1,low=Math.min(open,close)-1){
 const day='2026-06-02',minute=550+i;
 return {time:Date.parse('2026-06-02T09:10:00-04:00')+i*60000,day,minute,
  open,close,high,low,datetime:new Date(Date.parse('2026-06-02T09:10:00-04:00')+i*60000).toISOString()};
}
test('displacement and structure require completed close, not wick alone',()=>{
 const b=Array.from({length:9},(_,i)=>candle(i,101,100,102,99));
 b[8]=candle(8,99,105,105,98);
 assert.equal(qualifies(b,8,1),true);
 b[8]=candle(8,99,101,106,98);
 assert.equal(qualifies(b,8,1),false);
});
test('ATR fails closed over missing 1-minute data',()=>{
 const b=Array.from({length:30},(_,i)=>candle(i,100,101,103,99));
 assert.equal(atr(b,20),4);
 b[14]={...b[14],time:b[14].time+30000};
 assert.equal(atr(b,20),null);
});
test('continuation and reversion kept separate without order placement',()=>{
 const b=Array.from({length:1500},(_,i)=>{
  const day=i<750?'2026-06-02':'2026-07-02',j=i%750;
  const minute=540+j,open=25000+(j<30?j*.02:0);
  const when=Date.parse(day+'T09:00:00-04:00')+j*60000;
  return {day,minute,time:when,open,close:open+.01,high:open+2,low:open-2,datetime:new Date(when).toISOString()};
 });
 const a=runReplay(b,{strategy:'continuation',from:'2026-06-01',to:'2026-06-30'});
 const r=runReplay(b,{strategy:'reversion',from:'2026-07-01',to:'2026-07-31'});
 assert.equal(a.trades,0);assert.equal(r.trades,0);
 assert.equal(a.startingUSD,SETTINGS.initialEquity);
 assert.equal(r.netPnLUSD,0);
 assert.match(a.limitations,/Never submit orders/);
});
test('strategy allowlist and small datasets fail closed',()=>{
 assert.throws(()=>runReplay([],{}));
 const b=Array.from({length:110},(_,i)=>candle(i,100,100));
 assert.throws(()=>runReplay(b,{strategy:'LIVE'}));
});
