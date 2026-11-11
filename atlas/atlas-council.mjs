/**
 * Atlas council: five deterministic, independent, read-only reviewers.
 *
 * These are rule-based agents, not autonomous AI traders. No network, exchange
 * keys, shell access, model spend, or ability to place orders.
 * All five must approve any NEW paper position. Exits remain unconditional
 * on the council so a stop or a global halt can always close a paper position.
 */
export const AGENT_NAMES=Object.freeze([
  'market-data', 'market-research', 'strategy', 'risk', 'evidence',
]);
const BASE_ROUND_TRIP=2*(0.006+0.001);

function vote(name,approved,reason,metrics={}) {
  return Object.freeze({name,approved:Boolean(approved),reason,metrics});
}
function number(x) {return typeof x==='number'&&Number.isFinite(x);}

export function dataAgent(context) {
  const {bars,q,now}=context;
  if(!Array.isArray(bars)||bars.length<52)
    return vote('market-data',false,'INSUFFICIENT_BARS');
  if(!q||![q.price,q.ask,q.bid].every(number)||q.bid<=0||q.ask<q.bid)
    return vote('market-data',false,'INVALID_QUOTE');
  if(!number(now)||!number(bars.at(-1).time)||
     now/1000-bars.at(-1).time>1980||
     now/1000-bars.at(-1).time<899)
    return vote('market-data',false,'STALE_OR_UNCLOSED_BAR');
  for(let i=bars.length-51;i<bars.length;i++){
    if(!number(bars[i].time)||!number(bars[i].close)||bars[i].close<=0 ||
       bars[i].time-bars[i-1].time!==900)
      return vote('market-data',false,'GAP_OR_CORRUPT_BARS');
  }
  const spread=(q.ask-q.bid)/q.price;
  if(!number(spread)||spread>0.005)
    return vote('market-data',false,'WIDE_SPREAD',{spread});
  return vote('market-data',true,'VALID_COMPLETED_DATA',{spread});
}

export function researchAgent(context) {
  const {bars,q}=context;
  if(!Array.isArray(bars)||bars.length<52||!q)
    return vote('market-research',false,'NO_RESEARCH_WINDOW');
  const close=bars.at(-1)?.close,older=bars.at(-25)?.close;
  if(!number(close)||!number(older)||older<=0||!number(q.price)||q.price<=0)
    return vote('market-research',false,'INVALID_MOMENTUM_INPUTS');
  const momentum24=close/older-1;
  const gap=Math.abs(q.price/close-1);
  // Momentum is observed movement, NOT a prediction of future returns.
  if(gap>0.02) return vote('market-research',false,'PRICE_GAP',{momentum24,gap});
  if(momentum24<=0.025)
    return vote('market-research',false,'INSUFFICIENT_MOMENTUM',{momentum24,gap});
  return vote('market-research',true,'MOMENTUM_CONFIRMED',{momentum24,gap});
}

export function strategyAgent(context) {
  const {bars,signal}=context;
  if(signal!=='BUY')
    return vote('strategy',false,'NOT_BUY_SIGNAL',{signal});
  const closes=bars.map(x=>x.close),short=closes.slice(-20),long=closes.slice(-50);
  if(short.length!==20||long.length!==50||!long.every(x=>number(x)&&x>0))
    return vote('strategy',false,'INVALID_MA_INPUTS');
  const ma20=short.reduce((a,b)=>a+b,0)/20;
  const ma50=long.reduce((a,b)=>a+b,0)/50;
  if(ma20<=ma50) return vote('strategy',false,'UNCONFIRMED_TREND',{ma20,ma50});
  return vote('strategy',true,'TREND_CROSS_CONFIRMED',{ma20,ma50});
}
export function riskAgent(context) {
  const {state,symbol,marks,q}=context;
  if(!state||state.mode!=='PAPER'||state.halted)
    return vote('risk',false,'HALTED_OR_NOT_PAPER');
  if(state.positions?.[symbol])
    return vote('risk',false,'POSITION_ALREADY_OPEN');
  let eq=state.cash,gross=0;
  if(!number(eq)||eq<0||!number(state.peakEquity))
    return vote('risk',false,'INVALID_CASH_OR_PEAK');
  for(const [sym,pos] of Object.entries(state.positions||{})){
    const mark=marks?.[sym];
    if(!number(mark)||mark<=0||!number(pos.qty)||pos.qty<=0)
      return vote('risk',false,'MISSING_OR_INVALID_MARK');
    eq+=pos.qty*mark*(1-0.007);
    gross+=pos.qty*mark;
  }
  if(!q||!number(q.ask)||q.ask<=0)
    return vote('risk',false,'INVALID_ENTRY_PRICE');
  const budget=Math.min(state.cash,eq*0.1,eq*0.2-gross);
  if(eq<=0||budget<5||gross>eq*0.2)
    return vote('risk',false,'INSUFFICIENT_RISK_BUDGET',{budget});
  if(eq<=state.peakEquity*0.95)
    return vote('risk',false,'PORTFOLIO_DRAWDOWN_LIMIT',{equity:eq});
  return vote('risk',true,'WITHIN_PAPER_CAPITAL_LIMITS',{budget,exposure:gross});
}

export function evidenceAgent(context) {
  const s=context.state;
  if(!s||s.mode!=='PAPER'||!Array.isArray(s.fills))
    return vote('evidence',false,'INVALID_PAPER_LEDGER');
  if(s.fills.some(f=>f?.simulated!==true||!['BUY','SELL'].includes(f?.side)||
      !number(f.qty)||f.qty<=0||!number(f.fee)||f.fee<0))
    return vote('evidence',false,'UNVERIFIED_OR_CORRUPT_FILL');
  // No evidence of unconfirmed real orders can ever be called a paper fill.
  return vote('evidence',true,'SIMULATED_FILLS_ONLY',{paperFills:s.fills.length});
}
export function council(context) {
  const reviewers=[dataAgent,researchAgent,strategyAgent,riskAgent,evidenceAgent];
  // Reviewers always run, independent of other reviewers' results.
  const votes=reviewers.map(run=>{
    try{return run(context);}
    catch{return vote(AGENT_NAMES[reviewers.indexOf(run)],false,'AGENT_EXCEPTION');}
  });
  const approved=votes.length===AGENT_NAMES.length && votes.every(v=>v.approved);
  return Object.freeze({
    mode:'PAPER_ONLY',approved,
    verdict:approved?'UNANIMOUS_PAPER_APPROVAL':'VETO',
    vetoes:votes.filter(v=>!v.approved).map(v=>v.reason),
    votes,
    assumedRoundTripCostPct:BASE_ROUND_TRIP*100,
  });
}
