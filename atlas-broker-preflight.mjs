// Atlas brokerage readiness: two independent READ-ONLY checks, never places orders.
import {runAudit} from "./atlas-demo-audit-core.mjs";
import {livePreflight} from "./ops/atlas-live-preflight.mjs";

const demoCredentials={key:process.env.T212_API_KEY,secret:process.env.T212_API_SECRET};
const liveCredentials={key:process.env.T212_LIVE_API_KEY,secret:process.env.T212_LIVE_API_SECRET};
let failures=0;
try{
  const demo=await runAudit(demoCredentials);
  console.log(JSON.stringify({event:"atlas_demo_broker_audit",...demo}));
  if(demo.issues.length)failures++;
}catch(error){
  failures++;
  console.error(JSON.stringify({event:"atlas_demo_broker_audit_failed",
    reason:String(error?.message??error),ordersSubmitted:0,executionAllowed:false}));
}
if(liveCredentials.key&&liveCredentials.secret){
  try{
    const live=await livePreflight(liveCredentials);
    console.log(JSON.stringify({event:"atlas_live_connection_preflight",...live}));
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
  auditFailures:failures,automaticOrdersEnabled:false,liveAutoTradingReady:false}));
if(failures)process.exitCode=1;
