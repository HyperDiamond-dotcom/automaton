import test from 'node:test';
import assert from 'node:assert/strict';
import {candleFromCsv,collectRthDaily,indicators,decision,replay} from './study.mjs';
const h=['datetime','open','high','low','close','volume'];
test('parse EST and DST from New York offset without fabricated fills',()=>{
  const winter=candleFromCsv('2025-01-02 09:30:00-0500,100,102,99,101,5',h);
  const summer=candleFromCsv('2025-07-02 09:30:00-04:00,100,102,99,101,5',h);
  assert.equal(winter.min,570);assert.equal(summer.min,570);
});
test('reject malformed price feeds',()=>{
  assert.throws(()=>candleFromCsv('2025-01-02 09:30:00-0500,100,98,99,101,5',h));
});
function day(i){
  const month=Math.floor(i/28)+1,day=i%28+1;
  return {day:'2025-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),
    open:100+i,high:105+i,low:95+i,close:102+i};
}
test('HA is a synthetic decision signal, not a tradable price',()=>{
  const x=indicators(Array.from({length:70},(_,i)=>day(i)));
  assert.equal(x[0].haClose,(x[0].open+x[0].high+x[0].low+x[0].close)/4);
  assert.equal(decision('heikin-ashi',x.at(-1),false),'ENTER');
});
test('RTH filtering rejects missing minutes',()=>{
 const b=Array.from({length:390},(_,i)=>({day:'2025-01-03',min:570+i,open:101,high:103,low:99,close:100}));
 assert.equal(collectRthDaily(b).days.length,1);
 b.splice(100,1);
 assert.equal(collectRthDaily(b).days.length,0);
});
test('replay refuses an unsupported system and uses only actual market fills',()=>{
 const d=Array.from({length:100},(_,i)=>day(i));
 assert.throws(()=>replay(d,{type:'LIVE',from:'2025-01-02',to:'2025-04-16'}));
 const a=replay(d,{type:'heikin-ashi',from:'2025-01-02',to:'2025-04-16'});
 assert.ok(a.fills.every(f=>Number.isFinite(f.price)&&!f.synthetic));
 assert.match(a.disclaimer,/NEVER used as fills/);
});
