// Atlas Trading 212 DEMO order audit. Read-only; deliberately contains no POST, PUT, PATCH or DELETE.
// This audit is separate from the Railway volume-backed scanner and does not change its behaviour.
export const BASE = "https://demo.trading212.com";
const allowed = new Set(["/api/v0/equity/positions", "/api/v0/equity/orders", "/api/v0/equity/history/orders"]);
export function safeUrl(path) {
  if (typeof path !== "string" || !path || path.startsWith("//") || path.includes("\\")) throw Error("unsafe_demo_path");
  const u = new URL(path, BASE);
  if (u.origin !== BASE || !allowed.has(u.pathname) || u.username || u.password || u.hash) throw Error("read_only_demo_endpoint_required");
  const params = [...u.searchParams.keys()];
  if (new Set(params).size !== params.length) throw Error("duplicate_history_query");
  const limit = u.searchParams.get("limit");
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50)) throw Error("invalid_page_limit");
  const cursor = u.searchParams.get("cursor");
  if (cursor !== null && (!cursor || cursor.length > 512)) throw Error("invalid_cursor");
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
  const r = await fetcher(url,{method:"GET",redirect:"error",headers,signal:timer});
  if (!r.ok) throw Error("demo_api_http_"+r.status);
  return r.json();
}
export function reconcile(positions, pending, history, incompleteHistory=false) {
  if (![positions,pending,history].every(Array.isArray)) throw Error("invalid_broker_response");
  // The broker nests position tickers under instrument; orders may be flat.
  const tickerOf = entry => {
    const ticker = entry?.ticker ?? entry?.instrument?.ticker;
    return typeof ticker === "string" && ticker.trim() ? ticker : null;
  };
  // Malformed broker holdings must never vanish silently from a safety audit.
  const malformedPositions=positions.filter(x=>x?.quantity==null || !Number.isFinite(Number(x.quantity)) ||
    Number(x.quantity)<0 || (Number(x.quantity)>0 && !tickerOf(x)));
  const current=positions.filter(x=>Number.isFinite(Number(x?.quantity)) && Number(x.quantity)>0);
  const historical=history.map(x=>x.order??x);
  const filled=historical.filter(x=>x.status==="FILLED"||Number(x.filledQuantity)>0);
  const issues=[];
  if(malformedPositions.length)issues.push({code:"INVALID_POSITION_DATA_REQUIRES_REVIEW",count:malformedPositions.length});
  if(incompleteHistory)issues.push({code:"HISTORY_INCOMPLETE"});
  const unmatched=current.filter(p=>!tickerOf(p)||!filled.some(o=>tickerOf(o)===tickerOf(p)&&o.side==="BUY"));
  if(unmatched.length)issues.push({code:"POSITIONS_WITH_NO_MATCHING_BUY_IN_RETRIEVED_HISTORY",tickers:unmatched.map(tickerOf)});
  const names=new Set();
  for(const o of pending){
    const fingerprint=[tickerOf(o),o.side,o.type,o.quantity,o.limitPrice,o.stopPrice].join("|");
    if(names.has(fingerprint))issues.push({code:"POTENTIAL_DUPLICATE_PENDING_ORDER",ticker:tickerOf(o)});
    names.add(fingerprint);
  }
  // Quantity coverage from pending stops is observable; execution or price protection is NOT guaranteed.
  // No orders are placed or edited here; stop prices and duration require manual review.
  const stopCoverage=current.map(p=>{
    const ticker=tickerOf(p),positionQuantity=Number(p.quantity);
    const orders=pending.filter(o=>ticker && tickerOf(o)===ticker && o.side==="SELL" &&
      ["STOP","STOP_LIMIT"].includes(o.type) && Number.isFinite(Number(o.stopPrice)) &&
      Number(o.stopPrice)>0 && ["NEW","CONFIRMED","PARTIALLY_FILLED"].includes(o.status));
    const pendingStopQuantity=orders.reduce((sum,o)=>{
      const ordered=Math.abs(Number(o.quantity)),filled=Math.abs(Number(o.filledQuantity??0));
      return sum+(Number.isFinite(ordered)&&Number.isFinite(filled)?Math.max(0,ordered-filled):0);
    },0);
    const round=n=>Math.round(n*1e8)/1e8;
    return {ticker,positionQuantity:round(positionQuantity),pendingStopQuantity:round(pendingStopQuantity),
      uncoveredQuantity:round(Math.max(0,positionQuantity-pendingStopQuantity))};
  });
  const unprotectedPositions=stopCoverage.filter(p=>p.uncoveredQuantity>1e-7);
  if(unprotectedPositions.length)issues.push({code:"STOP_COVERAGE_REQUIRES_MANUAL_REVIEW",
    tickers:unprotectedPositions.map(p=>p.ticker)});
  return {mode:"DEMO_READ_ONLY",positionsObserved:current.length,pendingOrdersObserved:pending.length,historyOrdersRetrieved:history.length,brokerFilledOrdersRetrieved:filled.length,historyIncomplete:!!incompleteHistory,issues,stopCoverage,unprotectedPositions,
    stopCoverageSharesVerified:unprotectedPositions.length===0&&malformedPositions.length===0,
    stockTradeJournalReconciled:false,strategyJournalStatus:"NO_EXECUTION_JOURNAL_AVAILABLE",
    profitabilityDemonstrated:false,profitabilityStatus:"NOT_DEMONSTRATED",executionAllowed:false,liveReady:false};
}
export async function runAudit(credentials,fetcher=fetch,opts={}){
  const pageLimit=opts.maxPages??3;
  if(!Number.isInteger(pageLimit)||pageLimit<1||pageLimit>3)throw Error("invalid_max_pages");
  const sleep=opts.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const pace=fetcher===fetch||typeof opts.sleep==="function";
  const positions=await getDemo("/api/v0/equity/positions",credentials,fetcher);
  if(pace)await sleep(1200);
  const pending=await getDemo("/api/v0/equity/orders",credentials,fetcher);
  if(pace)await sleep(1200);
  let next="/api/v0/equity/history/orders?limit=50",pages=0,history=[],seen=new Set();
  while(next&&pages<pageLimit){
    const url=safeUrl(next);if(seen.has(url))throw Error("repeated_history_cursor");seen.add(url);
    // Historical-order endpoint: max 6 requests/minute; use 11s between pages.
    if(pages>0&&pace)await sleep(11000);
    const page=await getDemo(next,credentials,fetcher);
    if(!Array.isArray(page?.items))throw Error("history_response_unexpected");
    history.push(...page.items);
    next=page.nextPagePath??null;
    if(next)safeUrl(next);
    pages++;
  }
  const result=reconcile(positions,pending,history,!!next);
  return {checkedAt:new Date().toISOString(),historyPagesRetrieved:pages,...result};
}
