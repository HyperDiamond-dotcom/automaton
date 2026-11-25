import {runAudit} from "./atlas-demo-audit-core.mjs";
try {
  const report=await runAudit({key:process.env.T212_API_KEY,secret:process.env.T212_API_SECRET});
  console.log(JSON.stringify(report,null,2));
  if(report.issues.length) process.exitCode=1;
} catch (e) {
  console.error("DEMO audit failed:",e.message);
  process.exitCode=2;
}
