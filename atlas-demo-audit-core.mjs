// Atlas Trading 212 DEMO order audit. Read-only; deliberately contains no POST, PUT, PATCH or DELETE.
// This audit is separate from the Railway volume-backed scanner and does not change its behaviour.
export const BASE = "https://demo.trading212.com";
const allowed = new Set(["/api/v0/equity/positions", "/api/v0/equity/orders", "/api/v0/equity/history/orders"]);
export function safeUrl(path) {
  const u = new URL(path, BASE);
  if (u.origin !== BASE || !allowed.has(u.pathname)) throw Error("read_only_demo_endpoint_required");
  if (u.pathname !== "/api/v0/equity/history/orders" && u.search) throw Error("unexpected_query");
  if (u.pathname === "/api/v0/equity/history/orders" &&
      [...u.searchParams.keys()].some(k => !["limit","cursor"].includes(k))) throw Error("unexpected_history_query");
  return u.toString();
}
export async function getDemo(path, credentials, fetcher = fetch) {
  const url = safeUrl(path);
  if (!credentials?.key || !credentials?.secret) throw Error("demo_credentials_missing");
  const timer = AbortSignal.timeout(15000);
  const headers = {Authorization:"Basic "+Buffer.from(credentials.key+":"+credentials.secret).toString("base64"),Accept:"application/json"};
  const r = await fetcher(url,{method:"GET",headers,signal:timer});
  if (!r.ok) throw Error("demo_api_http_"+r.status);
  return r.json();
}
export function reconcile(positions, pending, history, incompleteHistory=false) {
  if (![positions,pending,history].every(Array.isArray)) throw Error("invalid_broker_response");
  const current=positions.filter(x=>Number(x.quantity)>0);
  const historical=history.map(x=>x.order??x);
  const filled=historical.filter(x=>x.status==="FILLED"||Number(x.filledQuantity)>0);
  const issues=[];
  if(incompleteHistory)issues.push({code:"HISTORY_INCOMPLETE"});
  const unmatched=current.filter(p=>!filled.some(o=>o.ticker===p.ticker&&(o.side==="BUY"||o.type==="BUY")));
  if(unmatched.length)issues.push({code:"POSITIONS_WITH_NO_MATCHING_BUY_IN_RETRIEVED_HISTORY",tickers:unmatched.map(x=>x.ticker)});
  const names=new Set();
  for(const o of pending){
    const fingerprint=[o.ticker,o.side,o.type,o.quantity,o.limitPrice,o.stopPrice].join("|");
    if(names.has(fingerprint))issues.push({code:"POTENTIAL_DUPLICATE_PENDING_ORDER",ticker:o.ticker});
    names.add(fingerprint);
  }
  const stopReviews=current.filter(p=>{
    const available=pending.filter(o=>o.ticker===p.ticker&&o.side==="SELL"&&["STOP","STOP_LIMIT"].includes(o.type)&&Number(o.stopPrice)>0&& !["CANCELLED","REJECTED","FILLED"].includes(o.status));
    return available.reduce((sum,o)=>sum+Math.abs(Number(o.quantity)||0),0)<Number(p.quantity);
  }).map(p=>p.ticker);
  if(stopReviews.length)issues.push({code:"STOP_COVERAGE_REQUIRES_MANUAL_REVIEW",tickers:stopReviews});
  return {mode:"DEMO_READ_ONLY",positionsObserved:current.length,pendingOrdersObserved:pending.length,historyOrdersRetrieved:history.length,brokerFilledOrdersRetrieved:filled.length,historyIncomplete:!!incompleteHistory,issues,stockTradeJournalReconciled:false,profitabilityDemonstrated:false,executionAllowed:false,liveReady:false};
}
export async function runAudit(credentials,fetcher=fetch){
  const [positions,pending]=await Promise.all([getDemo("/api/v0/equity/positions",credentials,fetcher),getDemo("/api/v0/equity/orders",credentials,fetcher)]);
  let next="/api/v0/equity/history/orders?limit=50",pages=0,history=[],seen=new Set();
  while(next&&pages<20){
    const url=safeUrl(next); if(seen.has(url))throw Error("repeated_history_cursor");seen.add(url);
    const page=await getDemo(next,credentials,fetcher);
    if(!Array.isArray(page?.items))throw Error("history_response_unexpected");
    history.push(...page.items);next=page.nextPagePath||null;pages++;
  }
  const result=reconcile(positions,pending,history,!!next);
  return {checkedAt:new Date().toISOString(),...result};
}
