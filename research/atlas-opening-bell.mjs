// Offline research only. No network, broker or deployment integration.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function backtest(sessions, options={}) {
  const {initialCash=10000,riskFraction=0.005,feeBps=2,slippageBps=5,atrMultiple=2}=options;
  if (![initialCash,riskFraction,feeBps,slippageBps,atrMultiple].every(Number.isFinite)||initialCash<=0||riskFraction<=0||riskFraction>0.005||feeBps<0||feeBps>=10000||slippageBps<0||slippageBps>=10000||atrMultiple<=0) throw Error("Invalid options");
  const fee=feeBps/10000, slip=slippageBps/10000;
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  if(!Array.isArray(sessions)||!sessions.length) throw Error("Provide full regular sessions");
  let cash=initialCash,peak=cash,maxDrawdown=0,lastDay="",trades=[],equity=[];
  const mark=v=>{peak=Math.max(peak,v);maxDrawdown=Math.max(maxDrawdown,(peak-v)/peak)};
  for(const bars of sessions){
    if(!Array.isArray(bars)||bars.length!==78) throw Error("Expected 78 five-minute bars per full session; exclude half days");
    let previous=0,day="";
    for(let i=0;i<bars.length;i++){
      const b=bars[i],t=Date.parse(b.timestamp);
      if(typeof b.timestamp!=="string"||!/(Z|[+-]\d\d:\d\d)$/.test(b.timestamp)||!Number.isFinite(t)||![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)) throw Error("Invalid OHLC or timestamp");
      const p=Object.fromEntries(fmt.formatToParts(t).map(x=>[x.type,x.value])), d=p.year+"-"+p.month+"-"+p.day;
      if(i===0){day=d;if(day<=lastDay||+p.hour!==9||+p.minute!==30||+p.second!==0||t%1000!==0)throw Error("Sessions must be chronological and start at 09:30 New York");}
      else if(d!==day||t-previous!==300000)throw Error("Missing or duplicate five-minute bar");
      previous=t;
    }
    lastDay=day;
    let ema=0,atr=0,pending=null,pos=null,used=false,priorClose=null;
    const openingHigh=bars[0].high;
    for(let i=0;i<bars.length;i++){
      const b=bars[i], priorEma=ema, priorAtr=atr;
      if(pending&&!used){
        const entry=b.open*(1+slip),stop=entry-atrMultiple*pending.atr;
        const exitAtStop=stop*(1-slip);
        const riskPerShare=entry*(1+fee)-exitAtStop*(1-fee);
        const quantity=stop>0?Math.floor(Math.min(cash/(entry*(1+fee)),cash*riskFraction/riskPerShare)):0;
        if(quantity>0){const cost=quantity*entry*(1+fee);cash-=cost;pos={entry,stop,quantity,cost,entryTime:b.timestamp};used=true;}
        pending=null;
      }
      if(pos){
        let rawExit=null,reason="";
        if(b.open<=pos.stop){rawExit=b.open;reason="gap-stop";}
        else if(b.low<=pos.stop){rawExit=pos.stop;reason="stop";}
        else if(i===77){rawExit=b.close;reason="session-close";}
        if(rawExit!==null){const exit=rawExit*(1-slip),proceeds=pos.quantity*exit*(1-fee);cash+=proceeds;trades.push({day,entryTime:pos.entryTime,exitBar:b.timestamp,entry:pos.entry,exit,quantity:pos.quantity,pnl:proceeds-pos.cost,reason});pos=null;mark(cash);}
        else mark(cash+pos.quantity*b.low*(1-slip)*(1-fee));
      }
      const tr=priorClose===null?b.high-b.low:Math.max(b.high-b.low,Math.abs(b.high-priorClose),Math.abs(b.low-priorClose));
      ema=i===0?b.close:priorEma+(2/13)*(b.close-priorEma);
      atr=i<14?(priorAtr*i+tr)/(i+1):(priorAtr*13+tr)/14;
      if(pos&&i>=13)pos.stop=Math.max(pos.stop,b.close-atrMultiple*atr);
      if(!used&&!pos&&i>=13&&i<76&&priorClose<=openingHigh&&b.close>openingHigh&&b.close>ema&&atr>0)pending={atr};
      priorClose=b.close;
      mark(pos?cash+pos.quantity*b.close*(1-slip)*(1-fee):cash);
    }
    equity.push({day,cash});
  }
  return {initialCash,finalCash:cash,netReturn:cash/initialCash-1,maxDrawdown,winRate:trades.length?trades.filter(t=>t.pnl>0).length/trades.length:null,tradeCount:trades.length,trades,equity};
}
function selfTest(){
  const check=(x,m)=>{if(!x)throw Error(m)};
  const fixture=(signal=true)=>Array.from({length:78},(_,i)=>{
    const close=signal&&i>=14?101+(i-14)*0.05:100;
    const open=i===14&&signal?100:close;
    return {timestamp:new Date(Date.UTC(2025,0,6,14,30)+i*300000).toISOString(),open,high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close};
  });
  const normal=backtest([fixture()]);
  check(normal.tradeCount===1,"one breakout trade");
  check(normal.trades[0].entryTime===fixture()[15].timestamp,"next bar entry");
  check(normal.trades[0].pnl>0,"rising fixture");
  check(backtest([fixture(false)]).tradeCount===0,"flat session");
  const gap=fixture();gap[16]={...gap[16],open:95,high:95.2,low:94.8,close:95};
  check(backtest([gap]).trades[0].reason==="gap-stop","gap stop");
  check(backtest([gap]).trades[0].pnl<0,"gap loss");
  check(backtest([fixture()],{feeBps:0,slippageBps:0}).finalCash>normal.finalCash,"costs reduce return");
  let rejected=false;try{backtest([fixture().slice(1)])}catch{rejected=true}check(rejected,"missing data rejected");
  return "8 synthetic assertions passed";
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--self-test') console.log(selfTest());
 else if(process.argv[2]) console.log(JSON.stringify(backtest(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
 else throw Error('Usage: node atlas-opening-bell.mjs --self-test | sessions.json');
}
