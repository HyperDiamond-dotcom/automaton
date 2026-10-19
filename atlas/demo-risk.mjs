// Proposed DEMO-only candidate gate. Pure logic: no broker connections or orders.
export const DEMO_LIMITS = Object.freeze({allocationPct:15, riskPct:0.75, maxPositions:5});
export function checkDemoBuy(data={}) {
  const errors=[];
  const {environment, liveTrading, ticker, instrumentType, instrumentCurrency,
    accountCurrency, quantity, price, stopPrice, accountEquity, existingExposure,
    existingPositions, autoExecuteEnabled, councilVerified, ledgerReconciled}=data;
  if (environment!=="DEMO" || liveTrading===true) errors.push("DEMO only");
  if (typeof ticker!=="string" || !/^[A-Z0-9.]+_US_EQ$/.test(ticker)) errors.push("Exact US ticker");
  if (instrumentType!=="STOCK" || instrumentCurrency!=="USD") errors.push("USD stock only");
  if (accountCurrency!==instrumentCurrency || !accountCurrency) errors.push("Unverified FX conversion");
  if (![quantity,price,stopPrice,accountEquity,existingExposure,existingPositions]
      .every(v=>typeof v==="number" && Number.isFinite(v))) errors.push("Missing numeric input");
  if (!(quantity>0 && price>0 && stopPrice>0 && stopPrice<price && accountEquity>0 &&
    existingExposure>=0 && Number.isInteger(existingPositions) && existingPositions>=0))
    errors.push("Invalid risk inputs");
  if (autoExecuteEnabled!==true || councilVerified!==true || ledgerReconciled!==true)
    errors.push("Execution, council or order ledger is unresolved");
  if (errors.length) return {allowed:false,errors};
  const notional=quantity*price, atRisk=quantity*(price-stopPrice);
  if (existingExposure+notional>accountEquity*DEMO_LIMITS.allocationPct/100)
    errors.push("Allocation limit");
  if (atRisk>accountEquity*DEMO_LIMITS.riskPct/100) errors.push("Risk per trade limit");
  if (existingPositions>=DEMO_LIMITS.maxPositions) errors.push("Position count limit");
  return {allowed:errors.length===0,errors,notional,atRisk};
}
