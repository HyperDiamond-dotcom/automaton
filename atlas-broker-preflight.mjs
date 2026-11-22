// Atlas brokerage readiness: two independent READ-ONLY checks, never places orders.
import {runAudit} from "./atlas-demo-audit-core.mjs";
import {livePreflight} from "./ops/atlas-live-preflight.mjs";

import { scanHolding } from "./ops/atlas-intraday-strength.mjs";

const demoCredentials={key:process.env.T212_API_KEY,secret:process.env.T212_API_SECRET};
const liveCredentials={key:process.env.T212_LIVE_API_KEY,secret:process.env.T212_LIVE_API_SECRET};
let failures=0;
let riskFindings=0;
try{
  const demo=await runAudit(demoCredentials);
  console.log(JSON.stringify({event:"atlas_demo_broker_audit",...demo}));
  if(demo.unprotectedPositions.length){
    console.error(JSON.stringify({event:"atlas_demo_unprotected_positions",
      severity:"CRITICAL",positions:demo.unprotectedPositions,
      stopProtectionTasks:demo.stopProtectionTasks,
      approvedStopPricesRequired:true,ordersSubmitted:0,
      executionAllowed:false,liveAutoTradingReady:false}));
  }
  if(demo.issues.length){
    riskFindings=demo.issues.length;
    console.warn(JSON.stringify({event:"atlas_demo_risk_findings",status:"REVIEW_REQUIRED",issues:demo.issues,
      executionAllowed:false,liveAutoTradingReady:false}));
  }
}catch(error){
  failures++;
  console.error(JSON.stringify({event:"atlas_demo_broker_audit_failed",
    reason:String(error?.message??error),ordersSubmitted:0,executionAllowed:false}));
}
if(liveCredentials.key&&liveCredentials.secret){
  try{
    const live=await livePreflight(liveCredentials);
    console.log(JSON.stringify({event:"atlas_live_connection_preflight",...live}));
    for (const ticker of live.heldTickers) {
      console.log(JSON.stringify({event:"atlas_live_holding_strength", ...await scanHolding(ticker)}));
    }
  }catch(error){
    failures++;
    console.error(JSON.stringify({event:"atlas_live_connection_preflight_failed",
      reason:String(error?.message??error),brokerOrderWrites:0,automaticOrdersEnabled:false}));
  }
}else{
  console.log(JSON.stringify({event:"atlas_live_connection_preflight",
    status:"WAITING_FOR_DISTINCT_READ_ONLY_LIVE_KEYS",
    brokerOrderWrites:0,automaticOrdersEnabled:false,liveAutoTradingReady:false}));
}
console.log(JSON.stringify({event:"atlas_broker_control_summary",
  auditFailures:failures+riskFindings,auditExecutionFailures:failures,riskFindings,
  riskStatus:failures?"CHECK_FAILED":riskFindings?"REVIEW_REQUIRED":"NO_FLAGGED_DEMO_RISK_ISSUES",
  auditCanSubmitOrders:false,configuredStrategyMode:process.env.ATLAS_MODE??"PREVIEW"}));
// Risk findings remain in the audit output. Reserve a failed job for checks that could not run.
if(failures)process.exitCode=1;

if (liveCredentials.key && liveCredentials.secret) {
  try {
    const { scanMarkets } = await import('./ops/atlas-market-scan.mjs');
    const observations=[];
    await scanMarkets(liveCredentials,console.log,fetch,Date.now,observations);
    const {runWealth}=await import('./ops/atlas-wealth.mjs');
    const decision=failures ? {mode:process.env.ATLAS_MODE??'PREVIEW',status:'BROKER_CHECK_FAILED',ordersSubmitted:0}
      : await runWealth(observations);
    console.log(JSON.stringify({event:'atlas_wealth_execution',...decision}));
  } catch (error) {
    console.error(JSON.stringify({event:'atlas_market_scan_failed',reason:error.message}));
    process.exitCode = 1;
  }
}
