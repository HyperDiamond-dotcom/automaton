import test from 'node:test';
import assert from 'node:assert/strict';
import {council,dataAgent,researchAgent,strategyAgent,riskAgent,evidenceAgent,AGENT_NAMES} from './atlas-council.mjs';
import {initialState,evaluate} from './crypto-paper.mjs';

const NOW=Date.UTC(2026,9,19,16,30);
const time=new Date(NOW-1000).toISOString();
const bars=()=>Array.from({length:52},(_,i)=>({time:NOW/1000-(52-i)*900,close:i===51?120:100}));
const quote=(price=120)=>({price,bid:price*0.9999,ask:price*1.0001,time});
const context=()=>({bars:bars(),q:quote(),now:NOW,state:initialState(),marks:{},symbol:'BTC-USD',signal:'BUY'});
test('all five agents vote and all must approve',()=>{
 const c=council(context());assert.equal(c.votes.length,5);
 assert.deepEqual(c.votes.map(v=>v.name),AGENT_NAMES);
 assert.equal(c.approved,true);
 assert.equal(c.verdict,'UNANIMOUS_PAPER_APPROVAL');
});
test('data agent vetoes missing candles and bad quote',()=>{
 assert.equal(dataAgent({...context(),bars:bars().slice(2)}).approved,false);
 assert.equal(dataAgent({...context(),q:{...quote(),bid:125,ask:120}}).approved,false);
});
test('research agent vetoes weak momentum and price gaps',()=>{
 const ctx=context();ctx.bars=ctx.bars.map(b=>({...b,close:100}));ctx.q=quote(100);
 assert.equal(researchAgent(ctx).approved,false);
 assert.equal(researchAgent({...context(),q:quote(150)}).approved,false);
});
test('strategy agent requires confirmed buying signal',()=>{
 assert.equal(strategyAgent({...context(),signal:'SELL'}).approved,false);
});
test('risk agent blocks when paper portfolio halted or exhausted',()=>{
 const ctx=context();ctx.state.halted=true;
 assert.equal(riskAgent(ctx).approved,false);
 ctx.state.halted=false;ctx.state.cash=1;
 assert.equal(riskAgent(ctx).approved,false);
});
test('evidence agent vetoes unverified or real-money fill',()=>{
 const ctx=context();ctx.state.fills=[{side:'BUY',qty:1,fee:0.6,simulated:false}];
 assert.equal(evidenceAgent(ctx).reason,'UNVERIFIED_OR_CORRUPT_FILL');
 assert.equal(council(ctx).approved,false);
});
test('council can never overrule halted state',()=>{
 const ctx=context();ctx.state.halted=true;
 const c=council(ctx);
 assert.equal(c.approved,false);
 assert.ok(c.vetoes.includes('HALTED_OR_NOT_PAPER'));
});
test('paper evaluator records vetoes and approvals in review trail',()=>{
 const ctx=context();
 const market={'BTC-USD':{bars:ctx.bars,q:ctx.q},
   'ETH-USD':{bars:ctx.bars,q:quote(120)}};
 const s=initialState(),r=evaluate(s,market,NOW);
 assert.equal(r.decisions[0].council.approved,true);
 assert.equal(r.decisions[0].action,'PAPER_BUY');
 assert.equal(s.agentEvents.length,2);
 const count=s.agentEvents.length;
 evaluate(s,market,NOW+1000);
 assert.equal(s.agentEvents.length,count);
});
