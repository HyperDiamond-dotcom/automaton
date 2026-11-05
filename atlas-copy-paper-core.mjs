// Isolated paper-only copy-trading risk engine. No broker/crypto SDK, HTTP, credentials or order APIs.
export const PAPER_LIMITS = Object.freeze({
  initialCashGBP: 1000,
  maxTradeFraction: 0.02,
  maxDailyNotionalFraction: 0.05,
  maxTotalExposureFraction: 0.15,
  maxTraderExposureFraction: 0.05,
  maxDailyDrawdownFraction: 0.02,
  maxPeakDrawdownFraction: 0.10,
  assumedFeeFraction: 0.001,
  maxSignalAgeMs: 15 * 60 * 1000,
  maxFutureSkewMs: 30 * 1000,
  maxMarkAgeMs: 15 * 60 * 1000,
});
const instruments = new Set(['BTC-GBP','ETH-GBP','SOL-GBP','VWRP.L','VUAG.L']);
const round = value => Math.round(value * 1e8) / 1e8;
const fail = code => { throw new Error(code); };
export function createPaperLedger(nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) fail('invalid_clock');
  return {schema:1,mode:'PAPER',cashGBP:PAPER_LIMITS.initialCashGBP,
    positions:{},seenSignalIds:[],daily:{date:new Date(nowMs).toISOString().slice(0,10),startingNavGBP:PAPER_LIMITS.initialCashGBP,entryNotionalGBP:0},
    peakNavGBP:PAPER_LIMITS.initialCashGBP,tradeCount:0};
}
function verifyLedger(state) {
  if (!state || state.schema!==1 || state.mode!=='PAPER'|| !Number.isFinite(state.cashGBP)||state.cashGBP<0 ||
      !state.positions || typeof state.positions!=='object'||Array.isArray(state.positions)||
      !Array.isArray(state.seenSignalIds)||!state.daily || !Number.isFinite(state.peakNavGBP)||state.peakNavGBP<=0) fail('invalid_paper_ledger');
  for (const p of Object.values(state.positions)) {
    if(!p || !Number.isFinite(p.units)||p.units<0||!Number.isFinite(p.priceGBP)||p.priceGBP<=0||
      !Number.isFinite(p.markedAtMs)||typeof p.traderId!=='string'||!instruments.has(p.symbol)) fail('invalid_paper_position');
  }
}
function nav(state) { return state.cashGBP + Object.values(state.positions).reduce((sum,p)=>sum+p.units*p.priceGBP,0); }
const positionKey=(trader,symbol)=>trader+'::'+symbol;
function skip(state,reason,meta={}) { return {state,status:'SKIPPED',reason,ordersSubmitted:0,executionAllowed:false,realMoney:false,...meta}; }
export function applyPaperCopySignal(ledger,signal,{nowMs=Date.now(),allowedTraders=[]}={}) {
  if(!Number.isFinite(nowMs)||!Array.isArray(allowedTraders)) fail('invalid_runtime_settings');
  const state=structuredClone(ledger); verifyLedger(state);
  const date=new Date(nowMs).toISOString().slice(0,10);
  if(date!==state.daily.date) {
    if(date<state.daily.date) fail('clock_moved_backwards');
    state.daily={date,startingNavGBP:round(nav(state)),entryNotionalGBP:0};
  }
  if(!signal || typeof signal!=='object'||Array.isArray(signal)) fail('invalid_signal');
  const {id,traderId,symbol,side,priceGBP,timestamp}=signal;
  if(typeof id!=='string'||!/^[-\w]{1,80}$/.test(id)||typeof traderId!=='string'||!/^[-\w]{1,80}$/.test(traderId)||
      !instruments.has(symbol)||!['BUY','SELL'].includes(side)||!Number.isFinite(priceGBP)||priceGBP<=0||priceGBP>10000000||
      typeof timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(timestamp)) fail('invalid_signal_fields');
  const eventMs=Date.parse(timestamp);
  if(!Number.isFinite(eventMs)) fail('invalid_signal_timestamp');
  if(!allowedTraders.includes(traderId)) return skip(state,'TRADER_NOT_ALLOWLISTED');
  if(state.seenSignalIds.includes(id)) return skip(state,'DUPLICATE_SIGNAL');
  if(nowMs-eventMs>PAPER_LIMITS.maxSignalAgeMs || eventMs-nowMs>PAPER_LIMITS.maxFutureSkewMs) return skip(state,'STALE_OR_FUTURE_SIGNAL');
  if(state.seenSignalIds.length>=10000) fail('signal_history_limit_reached');
  state.seenSignalIds.push(id);
  for(const p of Object.values(state.positions)) if(p.symbol===symbol){p.priceGBP=priceGBP;p.markedAtMs=nowMs;}
  if(side==='BUY' && Object.values(state.positions).some(p=>nowMs-p.markedAtMs>PAPER_LIMITS.maxMarkAgeMs || p.markedAtMs-nowMs>PAPER_LIMITS.maxFutureSkewMs))
    return skip(state,'STALE_POSITION_MARKS');
  const equity=nav(state); if(equity<=0) return skip(state,'NO_PAPER_EQUITY');
  state.peakNavGBP=Math.max(state.peakNavGBP,equity);
  const key=positionKey(traderId,symbol), owned=state.positions[key];
  const fee=PAPER_LIMITS.assumedFeeFraction;
  if(side==='SELL') {
    const portion=signal.closeFraction ?? 1;
    if(!Number.isFinite(portion)||portion<=0||portion>1) fail('invalid_close_fraction');
    if(!owned||owned.units<=0) return skip(state,'NO_POSITION_TO_CLOSE');
    const units=owned.units*portion, gross=units*priceGBP;
    owned.units=round(owned.units-units);state.cashGBP=round(state.cashGBP+gross*(1-fee));
    if(owned.units<1e-8)delete state.positions[key];
    state.tradeCount++;
    return {state,status:'PAPER_SELL',traderId,symbol,notionalGBP:round(gross),feeGBP:round(gross*fee),
      paperNAVGBP:round(nav(state)),ordersSubmitted:0,executionAllowed:false,realMoney:false};
  }
  const weight=signal.leaderAllocationFraction;
  if(!Number.isFinite(weight)||weight<=0||weight>1) fail('invalid_leader_allocation');
  if(equity<=state.daily.startingNavGBP*(1-PAPER_LIMITS.maxDailyDrawdownFraction)||
     equity<=state.peakNavGBP*(1-PAPER_LIMITS.maxPeakDrawdownFraction)) return skip(state,'LOSS_CIRCUIT_BREAKER');
  const exposure=Object.values(state.positions).reduce((sum,p)=>sum+p.units*p.priceGBP,0);
  const leaderExposure=Object.values(state.positions).filter(p=>p.traderId===traderId).reduce((sum,p)=>sum+p.units*p.priceGBP,0);
  const dailyRemaining=Math.max(0,state.daily.startingNavGBP*PAPER_LIMITS.maxDailyNotionalFraction-state.daily.entryNotionalGBP);
  const orderGBP=Math.max(0,Math.min(equity*weight,equity*PAPER_LIMITS.maxTradeFraction,
    equity*PAPER_LIMITS.maxTotalExposureFraction-exposure,
    equity*PAPER_LIMITS.maxTraderExposureFraction-leaderExposure,
    dailyRemaining,state.cashGBP/(1+fee)));
  if(orderGBP<1) return skip(state,'RISK_LIMIT_BLOCKED');
  const units=orderGBP/priceGBP;
  state.cashGBP=round(state.cashGBP-orderGBP*(1+fee));
  if(state.cashGBP<0 && state.cashGBP>-1e-5)state.cashGBP=0;
  if(state.cashGBP<0) fail('paper_cash_violation');
  const oldUnits=owned?.units||0;
  state.positions[key]={traderId,symbol,units:round(oldUnits+units),priceGBP,markedAtMs:nowMs};
  state.daily.entryNotionalGBP=round(state.daily.entryNotionalGBP+orderGBP);
  state.tradeCount++;
  return {state,status:'PAPER_BUY',traderId,symbol,notionalGBP:round(orderGBP),feeGBP:round(orderGBP*fee),
    paperNAVGBP:round(nav(state)),ordersSubmitted:0,executionAllowed:false,realMoney:false};
}
export function paperSummary(state) { verifyLedger(state);return {
  mode:'PAPER_ONLY',paperNAVGBP:round(nav(state)),cashGBP:state.cashGBP,
  exposureGBP:round(nav(state)-state.cashGBP),tradesSimulated:state.tradeCount,
  approvedMarketCurrencies:['GBP'],ordersSubmitted:0,executionAllowed:false,realMoney:false,
  risk:PAPER_LIMITS
};}