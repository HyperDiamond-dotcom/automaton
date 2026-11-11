// Atlas paper validation only. No account credentials, execution endpoints or orders.
// Uses the existing Atlas candle-signal implementation and walks history forward.
import { analyzeCandles } from './atlas-crypto-core.mjs';

const GRANULARITY = 900;
const BPS = 10000;
const round = (n, p=4) => Number(n.toFixed(p));

export function validateHistory(rows) {
  if (!Array.isArray(rows) || rows.length < 200) throw Error('insufficient_history');
  const sorted = rows.map(row => {
    if (!Array.isArray(row) || row.length < 6) throw Error('malformed_candle');
    const [time, low, high, open, close, volume] = row.slice(0,6).map(Number);
    if (![time,low,high,open,close,volume].every(Number.isFinite) ||
      time <= 0 || low <= 0 || high < Math.max(open,close) || low > Math.min(open,close) ||
      high < low || volume < 0) throw Error('invalid_candle');
    return {time,low,high,open,close,volume};
  }).sort((a,b)=>a.time-b.time);
  for (let i=1;i<sorted.length;i++) {
    if (sorted[i].time - sorted[i-1].time !== GRANULARITY) throw Error('non_contiguous_history');
  }
  return sorted;
}

export function simulateAtlas(rows, {startingCash=1000, feeBps=60, slippageBps=15,
  maxExposurePct=15, riskPerTradePct=0.5, maxHoldBars=24} = {}) {
  const candles=validateHistory(rows);
  if (![startingCash,feeBps,slippageBps,maxExposurePct,riskPerTradePct,maxHoldBars]
    .every(Number.isFinite) || startingCash<=0 || feeBps<0 || feeBps>200 ||
    slippageBps<0 || slippageBps>200 || maxExposurePct<=0 || maxExposurePct>100 ||
    riskPerTradePct<=0 || riskPerTradePct>5 || !Number.isInteger(maxHoldBars) || maxHoldBars<1)
    throw Error('invalid_risk_assumptions');
  let cash=startingCash, position=null, pending=null, peak=startingCash, maxDrawdown=0;
  let signalCount=0, feesPaid=0;
  const trades=[], equityCurve=[];
  const fee=feeBps/BPS, slip=slippageBps/BPS;
  const startIndex=150;
  const closeTrade=(bar,price,reason)=>{
    const gross=position.quantity*price, exitFee=gross*fee;
    const net=gross-exitFee-position.cost;
    cash+=gross-exitFee;feesPaid+=exitFee;
    trades.push({entryTime:new Date(position.entryTime*1000).toISOString(),
      exitTime:new Date(bar.time*1000).toISOString(),reason,
      entry:round(position.entry),exit:round(price),quantity:round(position.quantity,8),
      netPnl:round(net),netPnlPct:round(100*net/position.cost,3)});
    position=null;
  };
  for(let i=startIndex;i<candles.length;i++) {
    const bar=candles[i];
    // Signals from candle i-1 may only fill at candle i open, never the signal's close.
    if(pending && !position) {
      const entry=bar.open*(1+slip);
      const stopPct=Math.min(0.06,Math.max(0.015,pending.atrPct/100*1.5));
      const equity=cash;
      let quantity=Math.min(equity*(maxExposurePct/100)/entry,
        equity*(riskPerTradePct/100)/(entry*stopPct));
      const cost=quantity*entry*(1+fee);
      if(cost>cash)quantity*=cash/cost;
      if(quantity>0 && Number.isFinite(quantity)) {
        const totalCost=quantity*entry*(1+fee);
        cash-=totalCost;feesPaid+=quantity*entry*fee;
        position={quantity,entry,entryTime:bar.time,cost:totalCost,
          stop:entry*(1-stopPct),take:entry*(1+2*stopPct),age:0};
      }
    }
    pending=null;
    if(position) {
      position.age++;
      // Conservative intrabar order: a breached stop always wins over a target.
      if(bar.open<=position.stop) closeTrade(bar,bar.open*(1-slip),'gap_stop');
      else if(bar.low<=position.stop) closeTrade(bar,position.stop*(1-slip),'stop');
      else if(bar.high>=position.take) closeTrade(bar,position.take*(1-slip),'target');
      else if(position.age>=maxHoldBars) closeTrade(bar,bar.close*(1-slip),'time_exit');
    }
    const equity=cash+(position?.quantity||0)*bar.close;
    peak=Math.max(peak,equity);
    maxDrawdown=Math.max(maxDrawdown,100*(peak-equity)/peak);
    equityCurve.push({time:bar.time,equity:round(equity)});
    if(!position && i<candles.length-1) {
      const window=candles.slice(Math.max(0,i-299),i+1)
        .map(c=>[c.time,c.low,c.high,c.open,c.close,c.volume]);
      const nowMs=(bar.time+GRANULARITY)*1000+16000;
      const signal=analyzeCandles(window,nowMs,GRANULARITY);
      if(signal.signal==='LONG_WATCH') {signalCount++;pending=signal;}
    }
  }
  const last=candles.at(-1);
  if(position) closeTrade(last,last.close*(1-slip),'end_of_test');
  const winners=trades.filter(t=>t.netPnl>0), losers=trades.filter(t=>t.netPnl<=0);
  const grossWins=winners.reduce((a,t)=>a+t.netPnl,0);
  const grossLosses=losers.reduce((a,t)=>a+Math.abs(t.netPnl),0);
  const baselineOpen=candles[startIndex].open;
  const baselineNet=(last.close*(1-slip)*(1-fee))/(baselineOpen*(1+slip)*(1+fee));
  return {
    mode:'BACKTEST_ONLY_NO_ORDERS', strategy:'Atlas 15m breakout long watch',
    firstTestedBar:new Date(candles[startIndex].time*1000).toISOString(),
    lastTestedBar:new Date(last.time*1000).toISOString(),barsTested:candles.length-startIndex,
    startingCash,finalCash:round(cash),netReturnPct:round(100*(cash/startingCash-1),3),
    buyHoldPct:round(100*(baselineNet-1),3),maxDrawdownPct:round(maxDrawdown,3),
    signals:signalCount,trades:trades.length,winRatePct:trades.length?round(100*winners.length/trades.length,2):null,
    profitFactor:grossLosses?round(grossWins/grossLosses,3):null,
    feesPaid:round(feesPaid), assumptions:{feeBps,slippageBps,maxExposurePct,riskPerTradePct,maxHoldBars,
      exitPriority:'stop before target',fill:'next bar open'},
    sampleSufficient:trades.length>=30, liveReady:false,executionAllowed:false,ordersSubmitted:0,
    trades, equityCurve
  };
}
