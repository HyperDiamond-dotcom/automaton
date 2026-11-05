// Atlas copy-trading adapter scaffold: PAPER ONLY; intentionally no broker APIs or order functions.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPaperLedger,applyPaperCopySignal,paperSummary} from './atlas-copy-paper-core.mjs';
const log = x=>console.log(JSON.stringify({event:'atlas_copy_paper',...x}));
if(process.env.ATLAS_COPY_MODE !== 'PAPER') throw Error('PAPER_MODE_REQUIRED');
if(process.env.ATLAS_COPY_KILL_SWITCH !== 'OFF') {
  log({status:'KILL_SWITCH_ON',executionAllowed:false,realMoney:false,ordersSubmitted:0});
  process.exit(0);
}
const signalFile=process.env.ATLAS_COPY_SIGNALS_PATH;
const ledgerFile=process.env.ATLAS_COPY_LEDGER_PATH;
const allowlist=process.env.ATLAS_COPY_ALLOWED_TRADERS?.split(',').map(x=>x.trim()).filter(Boolean)||[];
if(!signalFile || !ledgerFile || allowlist.length===0) {
  log({status:'WAITING_FOR_APPROVED_SIGNAL_SOURCE_AND_LEDGER',executionAllowed:false,realMoney:false,ordersSubmitted:0});
  process.exit(0);
}
if(!signalFile.startsWith('/mnt/atlas-copy/') || !ledgerFile.startsWith('/mnt/atlas-copy/'))
  throw Error('PAPER_PATH_MUST_USE_ISOLATED_VOLUME');
let ledger;
try {ledger=JSON.parse(await readFile(ledgerFile,'utf8'));}
catch(e){if(e.code==='ENOENT')ledger=createPaperLedger();else throw e;}
const raw=await readFile(signalFile,'utf8');
if(Buffer.byteLength(raw)>65536) throw Error('signals_file_too_large');
const payload=JSON.parse(raw);
if(!Array.isArray(payload)||payload.length>50)throw Error('invalid_signals_batch');
const nowMs=Date.now();
let applied=0,skipped=0;
for(const signal of payload){
  const r=applyPaperCopySignal(ledger,signal,{nowMs,allowedTraders:allowlist});
  ledger=r.state;
  if(r.status.startsWith('PAPER_'))applied++;else skipped++;
  log({status:r.status,reason:r.reason,traderId:r.traderId,symbol:r.symbol,
    paperNotionalGBP:r.notionalGBP,ordersSubmitted:0,executionAllowed:false,realMoney:false});
}
await writeFile(ledgerFile+'.tmp',JSON.stringify(ledger)+'\n',{mode:0o600});
await rename(ledgerFile+'.tmp',ledgerFile);
log({status:'PAPER_RUN_COMPLETE',applied,skipped,...paperSummary(ledger)});