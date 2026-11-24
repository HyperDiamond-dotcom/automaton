// Preliminary evidence gate. No live authorization, network or broker access.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function reviewEvidence(report, evidence={}){
 const blockers=[], rejects=[];
 const need=(ok,msg)=>{if(!ok)blockers.push(msg)};
 need(evidence.kind==="historical","Real historical data required");
 need(typeof evidence.source==="string"&&/^https:\/\//.test(evidence.source),"Document source");
 need(typeof evidence.datasetSha256==="string"&&/^[a-f0-9]{64}$/i.test(evidence.datasetSha256),"Record dataset SHA-256");
 for(const k of ["calendarVerified","splitFrozenBeforeEvaluation","strategyRulesVerified","costModelVerified","independentReview"])need(evidence[k]===true,k+" not attested");
 const {earlier:a,later:b,laterDoubleFriction:c}=report||{};
 const valid=p=>p&&Number.isInteger(p.sessions)&&p.sessions>0&&Number.isInteger(p.tradeCount)&&p.tradeCount>=0&&p.tradeCount<=p.sessions&&["initialCash","finalCash","netReturn","maxDrawdown","buyAndHoldReturn","excessReturn"].every(k=>Number.isFinite(p[k]))&&p.initialCash>0&&p.finalCash>=0&&p.maxDrawdown>=0&&p.maxDrawdown<=1&&Math.abs(p.netReturn-(p.finalCash/p.initialCash-1))<1e-8&&Math.abs(p.excessReturn-(p.netReturn-p.buyAndHoldReturn))<1e-8&&Number.isFinite(Date.parse(p.start))&&Number.isFinite(Date.parse(p.end))&&Date.parse(p.start)<=Date.parse(p.end);
 need(valid(a)&&valid(b)&&valid(c),"Valid complete metrics required");
 if(valid(a)&&valid(b)&&valid(c)){
  need(Date.parse(a.end)<Date.parse(b.start),"Overlapping research and test periods");
  need(b.start===c.start&&b.end===c.end&&b.sessions===c.sessions&&b.initialCash===c.initialCash,"Stress period mismatch");
  need(a.sessions>=60&&b.sessions>=60&&b.tradeCount>=30,"Insufficient sample for preliminary review");
  if(b.netReturn<=0)rejects.push("Nonpositive test-period net return");
  if(c.netReturn<=0)rejects.push("Nonpositive doubled-friction return");
  if(b.excessReturn<=0)rejects.push("Does not beat price-only buy-and-hold");
  if(b.maxDrawdown>0.10||c.maxDrawdown>0.10)rejects.push("Drawdown exceeds provisional 10% ceiling");
 }
 return {status:rejects.length?"REJECT":blockers.length?"INSUFFICIENT_EVIDENCE":"REVIEW_CANDIDATE",blockers,rejects,liveTradingAuthorized:false,notes:"Preliminary research screen only. Thresholds are provisional, attestations require human verification, not proof of authenticity."};
}
function selfTest(){
 const p={sessions:80,tradeCount:40,initialCash:100,finalCash:110,netReturn:0.1,maxDrawdown:0.04,buyAndHoldReturn:0.02,excessReturn:0.08,start:"2025-01-02",end:"2025-05-01"};
 const later={...p,start:"2025-05-02",end:"2025-09-01"};
 const r={earlier:p,later,laterDoubleFriction:{...later}};
 const e={kind:"historical",source:"https://example.invalid/data",datasetSha256:"a".repeat(64),calendarVerified:true,splitFrozenBeforeEvaluation:true,strategyRulesVerified:true,costModelVerified:true,independentReview:true};
 const assert=(x,m)=>{if(!x)throw Error(m)};
 assert(reviewEvidence(r,e).status==="REVIEW_CANDIDATE","valid fixture");
 assert(reviewEvidence(r,{...e,kind:"synthetic"}).status==="INSUFFICIENT_EVIDENCE","synthetic");
 assert(reviewEvidence(r,{}).status==="INSUFFICIENT_EVIDENCE","missing provenance");
 assert(reviewEvidence({...r,later:{...later,tradeCount:1}},e).status==="INSUFFICIENT_EVIDENCE","small sample");
 assert(reviewEvidence({...r,later:{...later,maxDrawdown:.11}},e).status==="REJECT","drawdown");
 assert(reviewEvidence({...r,laterDoubleFriction:{...later,finalCash:99,netReturn:-.01,excessReturn:-.03}},e).status==="REJECT","stress loss");
 assert(reviewEvidence({...r,later:{...later,netReturn:999}},e).status==="INSUFFICIENT_EVIDENCE","inconsistent accounting");
 assert(reviewEvidence({...r,earlier:{...p,end:later.start}},e).status==="INSUFFICIENT_EVIDENCE","overlap");
 assert(reviewEvidence(r,e).liveTradingAuthorized===false,"no live authorization");
 return "9 evidence gate assertions passed";
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv[2]==='--self-test')console.log(selfTest());else{const x=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(reviewEvidence(x.report,x.evidence),null,2));}}
